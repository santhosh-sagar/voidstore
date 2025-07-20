const { MongoClient } = require('mongodb');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: 'dexk8y7pf',
  api_key: '631334578834385',
  api_secret: '1_pQoVenaD93PuoHH83RfplK4C0',
});

async function updateBookUrls() {
  const mongoUri = 'mongodb+srv://VoidStore:VoidStore000@cluster0.pwxl36z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db('voidstore');
    const books = await db.collection('books').find().toArray();
    for (const book of books) {
      if (book.pdf && fs.existsSync(book.pdf)) {
        const pdfResult = await cloudinary.uploader.upload(book.pdf, {
          resource_type: 'raw',
          folder: 'voidstore/pdfs',
        });
        await db.collection('books').updateOne(
          { id: book.id },
          { $set: { pdf: pdfResult.secure_url } }
        );
      }
      if (book.image && fs.existsSync(book.image)) {
        const imageResult = await cloudinary.uploader.upload(book.image, {
          folder: 'voidstore/images',
        });
        await db.collection('books').updateOne(
          { id: book.id },
          { $set: { image: imageResult.secure_url } }
        );
      }
    }
    console.log('Book URLs updated successfully');
  } catch (err) {
    console.error('Error updating URLs:', err);
  } finally {
    await client.close();
  }
}

updateBookUrls();