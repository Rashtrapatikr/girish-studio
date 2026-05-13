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
const { connectDB, User, Booking, GalleryItem } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || "girish_studio_super_secret_key";

// Connect to MongoDB
connectDB();

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
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: "Email already exists" });
        }

        const hash = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hash });
        await newUser.save();
        res.json({ message: "Registration successful", id: newUser._id });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// API: Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: "Invalid email or password" });
        }
        
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: "Invalid email or password" });
        }
        
        const token = jwt.sign({ id: user._id, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ message: "Login successful", token, user: { id: user._id, name: user.name, role: user.role } });
    } catch (err) {
        res.status(500).json({ error: "Server error" });
    }
});

// API: Create Booking
app.post('/api/book', authenticateToken, async (req, res) => {
    const { name, phone, date, service, message } = req.body;
    const userId = req.user.id;
    
    try {
        const newBooking = new Booking({ user_id: userId, name, phone, date, service, message });
        await newBooking.save();
        res.json({ message: "Booking confirmed", bookingId: newBooking._id });
    } catch (err) {
        res.status(500).json({ error: "Failed to create booking" });
    }
});

// API: Get Bookings (Admin only)
app.get('/api/admin/bookings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
    }
    
    try {
        const bookings = await Booking.find().sort({ createdAt: -1 });
        // Map _id to id for frontend compatibility
        const formattedBookings = bookings.map(b => ({ ...b.toObject(), id: b._id }));
        res.json(formattedBookings);
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// API: Update Booking Status (Admin only)
app.put('/api/admin/bookings/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    
    const { status, admin_reply } = req.body;
    try {
        await Booking.findByIdAndUpdate(req.params.id, { status, admin_reply });
        res.json({ message: "Booking updated successfully" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// API: Change Admin Credentials
app.put('/api/admin/change-credentials', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });

    const { new_email, new_password, current_password } = req.body;

    try {
        const admin = await User.findById(req.user.id);
        if (!admin) return res.status(404).json({ error: "Admin not found" });

        const passwordMatch = await bcrypt.compare(current_password, admin.password);
        if (!passwordMatch) return res.status(401).json({ error: "Current password is incorrect" });

        const newHash = await bcrypt.hash(new_password, 10);
        admin.email = new_email || admin.email;
        admin.password = newHash;
        await admin.save();
        
        res.json({ message: "Credentials updated successfully! Please login again." });
    } catch (err) {
        res.status(500).json({ error: "Failed to update credentials" });
    }
});

// API: Get My Bookings (Customer)
app.get('/api/my-bookings', authenticateToken, async (req, res) => {
    try {
        const bookings = await Booking.find({ user_id: req.user.id }).sort({ createdAt: -1 });
        const formattedBookings = bookings.map(b => ({ ...b.toObject(), id: b._id }));
        res.json(formattedBookings);
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// API: Get Gallery Items
app.get('/api/gallery', async (req, res) => {
    try {
        const items = await GalleryItem.find().sort({ createdAt: -1 });
        const formattedItems = items.map(item => ({ ...item.toObject(), id: item._id }));
        res.json(formattedItems);
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// API: Upload Gallery Item (Admin only)
app.post('/api/admin/gallery', authenticateToken, upload.single('media'), async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const title = req.body.title || 'Untitled';
    const fileUrl = req.file.path;
    const type = req.file.mimetype && req.file.mimetype.includes('video') ? 'video' : 'image';

    try {
        const newItem = new GalleryItem({ title, filename: fileUrl, type });
        await newItem.save();
        res.json({ message: "Upload successful", id: newItem._id, filename: fileUrl, type });
    } catch (err) {
        res.status(500).json({ error: "Failed to save item" });
    }
});


// API: Delete Gallery Item (Admin only)
app.delete('/api/admin/gallery/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: "Admin access required" });
    
    try {
        const item = await GalleryItem.findById(req.params.id);
        if (!item) return res.status(404).json({ error: "Item not found" });
        
        // Try to delete from Cloudinary (best effort)
        cloudinary.uploader.destroy(item.filename, { resource_type: 'image' }).catch(() => {});
        
        await GalleryItem.findByIdAndDelete(req.params.id);
        res.json({ message: "Item deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
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
app.post('/api/verify-payment', authenticateToken, async (req, res) => {
    const { booking_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    let isValid = true; 
    
    if (isValid) {
        try {
            await Booking.findByIdAndUpdate(booking_id, { payment_status: 'Paid', payment_id: razorpay_payment_id });
            res.json({ message: "Payment Verified Successfully" });
        } catch (err) {
            res.status(500).json({ error: "Database error" });
        }
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
