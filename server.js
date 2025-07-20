const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
// --- New: MongoDB, Cloudinary, Google Auth, and JWT dependencies ---
const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const app = express();
const port = 5000;

// --- New: MongoDB and Cloudinary configuration ---
const mongoUri = 'mongodb+srv://VoidStore:VoidStore000@cluster0.pwxl36z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // Replace with your MongoDB Atlas URI
const client = new MongoClient(mongoUri);
const dbName = 'voidstore';
const booksCollection = 'books';
const usersCollection = 'users';
const purchasesCollection = 'purchases';

cloudinary.config({
  cloud_name: 'dexk8y7pf', // Replace with your Cloudinary cloud name
  api_key: '631334578834385', // Replace with your Cloudinary API key
  api_secret: '1_pQoVenaD93PuoHH83RfplK4C0', // Replace with your Cloudinary API secret
});

const googleClient = new OAuth2Client('492100904405-1hvnh9gtmi26sk2m61bdp3phcusp3ego.apps.googleusercontent.com'); // Replace with your Google OAuth client ID
const jwtSecret = 'shifiwecinweicweiDUADHcencuscuewfASduXNASd'; // Replace with a secure secret for JWT

app.use(cors());
app.use(express.json());
// --- Modified: Serve uploads statically (for compatibility, though Cloudinary will be primary) ---
app.use('/uploads', express.static(path.join(__dirname, '../Uploads')));

// --- New: Connect to MongoDB ---
async function connectDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
  }
}
connectDB();

// Configure multer for file uploads (temporary local storage before Cloudinary)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, '../Uploads/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf' || ext === '.jpg' || ext === '.jpeg') {
      cb(null, true);
    } else {
      cb(new Error('Only PDFs and JPG/JPEG images are allowed'), false);
    }
  },
});

// Ensure uploads directory exists
if (!fs.existsSync('../Uploads')) {
  fs.mkdirSync('../Uploads');
}

// --- Commented Out: Old file-based book storage ---
// const getBooks = () => {
//   try {
//     const data = fs.readFileSync('books.json', 'utf8');
//     return JSON.parse(data);
//   } catch (err) {
//     return [];
//   }
// };
//
// const saveBooks = (books) => {
//   fs.writeFileSync('books.json', JSON.stringify(books, null, 2));
// };

// --- New: MongoDB-based book retrieval ---
async function getBooks() {
  try {
    const db = client.db(dbName);
    return await db.collection(booksCollection).find().toArray();
  } catch (err) {
    console.error('Error fetching books:', err);
    return [];
  }
}

async function getBookById(id) {
  try {
    const db = client.db(dbName);
    return await db.collection(booksCollection).findOne({ id });
  } catch (err) {
    console.error('Error fetching book by ID:', err);
    return null;
  }
}

// --- New: Google OAuth verification and JWT issuance ---
app.post('/api/auth/google', async (req, res) => {
  // --- Start of newly added section: Google OAuth authentication ---
  // This endpoint verifies the Google OAuth token, creates/updates user in MongoDB, and issues a JWT
  try {
    const { token } = req.body;
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: '492100904405-1hvnh9gtmi26sk2m61bdp3phcusp3ego.apps.googleusercontent.com', // Replace with your Google OAuth client ID
    });
    const payload = ticket.getPayload();
    const email = payload['email'];
    const name = payload['name'];

    const db = client.db(dbName);
    const user = await db.collection(usersCollection).findOne({ email });
    const userData = {
      email,
      name,
      contact: user ? user.contact : 'Not provided',
      createdAt: new Date(),
    };

    if (!user) {
      await db.collection(usersCollection).insertOne(userData);
    } else {
      await db.collection(usersCollection).updateOne({ email }, { $set: { name, contact: userData.contact } });
    }

    const jwtToken = jwt.sign({ email, name }, jwtSecret, { expiresIn: '1h' });
    res.json({ token: jwtToken, user: userData });
  } catch (err) {
    console.error('Error verifying Google token:', err);
    res.status(401).json({ error: 'Invalid Google token' });
  }
  // --- End of newly added section ---
});

// Get all books
app.get('/api/books', async (req, res) => {
  // --- Modified: Use MongoDB instead of file ---
  const books = await getBooks();
  res.json(books);
});

// Get single book by ID
app.get('/api/books/:id', async (req, res) => {
  // --- Modified: Use MongoDB instead of file ---
  const book = await getBookById(req.params.id);
  if (book) {
    res.json(book);
  } else {
    res.status(404).json({ error: 'Book not found' });
  }
});

// --- New: Middleware to verify JWT ---
function verifyToken(req, res, next) {
  // --- Start of newly added section: JWT verification ---
  // This middleware checks for a valid JWT in the Authorization header
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  jwt.verify(token, jwtSecret, (err, decoded) => {
    if (err) return res.status(401).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
  // --- End of newly added section ---
}

// Admin: Upload book (protected with JWT and admin email check)
app.post('/api/books', verifyToken, upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'image', maxCount: 1 }]), async (req, res) => {
  // --- Modified: Check JWT user email and upload to Cloudinary ---
  if (req.user.email !== 'admin@thevoidcompany.org') {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const { title, author, tagline, description, features, price } = req.body;
  let pdfUrl = '';
  let imageUrl = '';

  // --- Start of newly added section: Cloudinary file upload ---
  // This section uploads PDF and image to Cloudinary and retrieves their URLs
  try {
    if (req.files.pdf) {
      const pdfResult = await cloudinary.uploader.upload(req.files.pdf[0].path, {
        resource_type: 'raw',
        folder: 'voidstore/pdfs',
      });
      pdfUrl = pdfResult.secure_url;
      fs.unlinkSync(req.files.pdf[0].path); // Clean up local file
    }
    if (req.files.image) {
      const imageResult = await cloudinary.uploader.upload(req.files.image[0].path, {
        folder: 'voidstore/images',
      });
      imageUrl = imageResult.secure_url;
      fs.unlinkSync(req.files.image[0].path); // Clean up local file
    }
  } catch (err) {
    console.error('Error uploading to Cloudinary:', err);
    return res.status(500).json({ error: 'Error uploading files' });
  }
  // --- End of newly added section ---

  // --- Modified: Save to MongoDB instead of file ---
  const newBook = {
    id: Date.now().toString(),
    title,
    author,
    tagline,
    description,
    features: JSON.parse(features),
    price: parseFloat(price),
    pdf: pdfUrl,
    image: imageUrl,
  };

  try {
    const db = client.db(dbName);
    await db.collection(booksCollection).insertOne(newBook);
    res.json(newBook);
  } catch (err) {
    console.error('Error saving book to MongoDB:', err);
    res.status(500).json({ error: 'Error saving book' });
  }
});

// --- New: Get user data ---
app.get('/api/users/:email', verifyToken, async (req, res) => {
  // --- Start of newly added section: Fetch user data ---
  // This endpoint retrieves user profile data from MongoDB
  if (req.user.email !== req.params.email) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const db = client.db(dbName);
    const user = await db.collection(usersCollection).findOne({ email: req.params.email });
    if (user) {
      res.json(user);
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: 'Error fetching user' });
  }
  // --- End of newly added section ---
});

// --- New: Get purchase history ---
app.get('/api/purchases/:email', verifyToken, async (req, res) => {
  // --- Start of newly added section: Fetch purchase history ---
  // This endpoint retrieves a user’s purchase history from MongoDB
  if (req.user.email !== req.params.email) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    const db = client.db(dbName);
    const purchases = await db.collection(purchasesCollection).find({ email: req.params.email }).toArray();
    res.json(purchases);
  } catch (err) {
    console.error('Error fetching purchases:', err);
    res.status(500).json({ error: 'Error fetching purchases' });
  }
  // --- End of newly added section ---
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});