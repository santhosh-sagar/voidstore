const { MongoClient } = require('mongodb');
const fs = require('fs');

async function migrateBooks() {
  const mongoUri = 'mongodb+srv://VoidStore:VoidStore000@cluster0.pwxl36z.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'; // Replace with your URI
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db('voidStore');
    const books = JSON.parse(fs.readFileSync('books.json', 'utf8'));
    await db.collection('books').insertMany(books);
    console.log('Books migrated successfully');
  } catch (err) {
    console.error('Error migrating books:', err);
  } finally {
    await client.close();
  }
}

migrateBooks();