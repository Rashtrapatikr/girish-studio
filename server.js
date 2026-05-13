require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "girish_studio_super_secret_key";

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static HTML/CSS/JS files
app.use(express.static(path.join(__dirname)));

// Multer + Cloudinary setup for file uploads
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const isVideo = file.mimetype.includes('video');
        return {
            folder: 'girish-studio',
            resource_type: isVideo ? 'video' : 'image',
            public_id: Date.now() + '-' + file.originalname.replace(/\s+/g, '-').replace(/\.[^/.]+$/, '')
        };
    }
});
const upload = multer({ storage: storage });

// Authentication Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "Access Denied" });
    
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Invalid Token" });
        req.user = user;
        next();
    });
};

// API: Register
app.post('/api/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        db.run("INSERT INTO users (name, email, password) VALUES (?, ?, ?)", [name, email, hash], function(err) {
            if (err) {
                return res.status(400).json({ error: "Email already exists" });
            }
            res.json({ message: "Registration successful", id: this.lastID });
        });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// API: Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], async (err, user) => {
        if (err || !user) {
            return res.status(400).json({ error: "Invalid email or password" });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: "Invalid email or password" });
        }
        
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ message: "Login successful", token, user: { id: user.id, name: user.name, role: user.role } });
    });
});

// API: Create Booking
app.post('/api/book', authenticateToken, (req, res) => {
    const { name, phone, date, service, message } = req.body;
    const userId = req.user.id;
    
    db.run("INSERT INTO bookings (user_id, name, phone, date, service, message) VALUES (?, ?, ?, ?, ?, ?)", 
        [userId, name, phone, date, service, message], function(err) {
        if (err) {
            return res.status(500).json({ error: "Failed to create booking" });
        }
        res.json({ message: "Booking confirmed", bookingId: this.lastID });
    });
});

// API: Get Bookings (Admin only)
app.get('/api/admin/bookings', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
    }
    
    db.all("SELECT * FROM bookings ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// API: Update Booking Status (Admin only)
app.put('/api/admin/bookings/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    
    const { status, admin_reply } = req.body;
    db.run("UPDATE bookings SET status = ?, admin_reply = ? WHERE id = ?", [status, admin_reply, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json({ message: "Booking updated successfully" });
    });
});

// API: Change Admin Credentials
app.put('/api/admin/change-credentials', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

    const { new_email, new_password, current_password } = req.body;

    db.get("SELECT * FROM users WHERE id = ?", [req.user.id], async (err, admin) => {
        if (err || !admin) return res.status(404).json({ error: "Admin not found" });

        const passwordMatch = await bcrypt.compare(current_password, admin.password);
        if (!passwordMatch) return res.status(401).json({ error: "Current password is incorrect" });

        const newHash = await bcrypt.hash(new_password, 10);
        const emailToSet = new_email || admin.email;

        db.run("UPDATE users SET email = ?, password = ? WHERE id = ?", [emailToSet, newHash, req.user.id], function(err) {
            if (err) return res.status(500).json({ error: "Failed to update credentials" });
            res.json({ message: "Credentials updated successfully! Please login again." });
        });
    });
});

// API: Get My Bookings (Customer)
app.get('/api/my-bookings', authenticateToken, (req, res) => {
    db.all("SELECT * FROM bookings WHERE user_id = ? ORDER BY id DESC", [req.user.id], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// API: Get Gallery Items
app.get('/api/gallery', (req, res) => {
    db.all("SELECT * FROM gallery_items ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// API: Upload Gallery Item (Admin only)
app.post('/api/admin/gallery', authenticateToken, upload.single('media'), (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const title = req.body.title || 'Untitled';
    // Cloudinary gives us a full URL in req.file.path
    const fileUrl = req.file.path;
    const publicId = req.file.filename;
    const type = req.file.mimetype && req.file.mimetype.includes('video') ? 'video' : 'image';

    db.run("INSERT INTO gallery_items (title, filename, type) VALUES (?, ?, ?)", [fileUrl, publicId, type], function(err) {
        if (err) return res.status(500).json({ error: "Failed to save item" });
        res.json({ message: "Upload successful", id: this.lastID, filename: fileUrl, type });
    });
});

// API: Delete Gallery Item (Admin only)
app.delete('/api/admin/gallery/:id', authenticateToken, (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    
    db.get("SELECT filename FROM gallery_items WHERE id = ?", [req.params.id], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Item not found" });
        
        // Delete from Cloudinary using the public_id stored
        cloudinary.uploader.destroy(row.filename, { resource_type: 'image' }).catch(() => {});
        
        db.run("DELETE FROM gallery_items WHERE id = ?", [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ message: "Item deleted successfully" });
        });
    });
});

// --- RAZORPAY PAYMENT GATEWAY ---
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret'
});

// Create Order API
app.post('/api/create-order', authenticateToken, async (req, res) => {
    const { booking_id, amount } = req.body;
    try {
        // MOCK ORDER (Because we don't have real keys yet)
        // To use real Razorpay, uncomment the lines below:
        /*
        const options = { amount: amount * 100, currency: "INR", receipt: "receipt_" + booking_id };
        const order = await razorpay.orders.create(options);
        return res.json(order);
        */
        
        res.json({
            id: "order_mock_" + Date.now(),
            amount: amount * 100,
            currency: "INR",
            receipt: "receipt_" + booking_id
        });
    } catch (err) {
        res.status(500).json({ error: "Could not create order" });
    }
});

// Verify Payment API
app.post('/api/verify-payment', authenticateToken, (req, res) => {
    const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // MOCK VERIFICATION
    let isValid = true; 
    
    // Real Verification (Uncomment when using real keys)
    /* 
    const hmac = crypto.createHmac('sha256', 'dummy_secret'); // use your real secret here
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated_signature = hmac.digest('hex');
    isValid = generated_signature === razorpay_signature;
    */
    
    if (isValid) {
        db.run("UPDATE bookings SET payment_status = 'Paid', payment_id = ? WHERE id = ?", [razorpay_payment_id, booking_id], function(err) {
            if (err) return res.status(500).json({ error: "Database error" });
            res.json({ message: "Payment Verified Successfully" });
        });
    } else {
        res.status(400).json({ error: "Invalid Signature" });
    }
});

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
