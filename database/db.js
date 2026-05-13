const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Create default admin user if it doesn't exist
    const bcrypt = require('bcrypt');
    const User = require('mongoose').model('User');
    const adminExists = await User.findOne({ email: 'admin@girishstudio.com' });
    if (!adminExists) {
        const hash = await bcrypt.hash('rash@123', 10);
        await User.create({
            name: 'Admin',
            email: 'admin@girishstudio.com',
            password: hash,
            role: 'admin'
        });
        console.log('Default Admin user created.');
    }
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};

// --- SCHEMAS & MODELS ---

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'customer' }
});

const bookingSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  phone: { type: String, required: true },
  date: { type: String, required: true },
  service: { type: String, required: true },
  message: { type: String },
  status: { type: String, default: 'Pending' },
  admin_reply: { type: String },
  payment_status: { type: String, default: 'Pending' },
  payment_id: { type: String }
}, { timestamps: true });

const galleryItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  filename: { type: String, required: true },
  type: { type: String, default: 'image' }
}, { timestamps: true });

// Export Models
const User = mongoose.model('User', userSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const GalleryItem = mongoose.model('GalleryItem', galleryItemSchema);

module.exports = { connectDB, User, Booking, GalleryItem };
