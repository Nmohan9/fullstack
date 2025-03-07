const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const path = require('path');
const bcrypt = require('bcrypt');
const fetch = require('node-fetch'); 

const app = express();

// Initialize Firebase Admin SDK
const serviceAccount = require('./fwd-2-4dd09-firebase-adminsdk-fbsvc-1e83becfd3.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();


app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const saltRounds = 10;


app.get('/', (req, res) => {
  res.render('welcome');
});


app.get('/signup', (req, res) => {
  res.render('signup');
});

app.post('/signup', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) return res.status(400).send("Email and password are required");

    const existingUser = await db.collection('users').where('email', '==', email).get();
    if (!existingUser.empty) return res.status(400).send('Email already exists');

    const hashedPassword = await bcrypt.hash(password, saltRounds);
    await db.collection('users').add({ email, password: hashedPassword });

    res.redirect('/login');
  } catch (error) {
    res.status(500).send('Error: ' + error.message);
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) return res.status(400).send("Email and password are required");

    const userQuery = await db.collection('users').where('email', '==', email).get();
    if (userQuery.empty) return res.status(401).send('Invalid email or password');

    const userData = userQuery.docs[0].data();
    const passwordMatch = await bcrypt.compare(password, userData.password);

    if (passwordMatch) {
      res.redirect('/dashboard');
    } else {
      res.status(401).send('Invalid email or password');
    }
  } catch (error) {
    res.status(500).send('Error: ' + error.message);
  }
});


app.get('/dashboard', async (req, res) => {
  try {
    const { default: fetch } = await import('node-fetch');
    const searchTerm = req.query.q || 'nature';
    const response = await fetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(searchTerm)}&client_id=D8gzXo5AYwifN-F1MoiU5lCeMhUQZeSE-1-DVSU_z8A`);

    if (!response.ok) throw new Error(`Unsplash API Error: ${response.statusText}`);

    const data = await response.json();
    const images = await Promise.all(
      data.results.map(async (image) => {
        const imageRef = db.collection('images').doc(image.id);
        const imageDoc = await imageRef.get();

        let likes = 0;
        let comments = [];

        if (imageDoc.exists) {
          const imageData = imageDoc.data();
          likes = imageData.likes || 0;
          comments = imageData.comments || [];
        } else {
          await imageRef.set({ likes: 0, comments: [] });
        }

        return {
          id: image.id,
          url: image.urls.small,
          alt: image.alt_description || "Image",
          likes,
          comments,
        };
      })
    );

    res.render('dashboard', { images });
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).send('Error fetching images');
  }
});



app.post('/like/:imageId', async (req, res) => {
  try {
    const imageId = req.params.imageId;
    const imageRef = db.collection('images').doc(imageId);
    const imageDoc = await imageRef.get();

    if (!imageDoc.exists) {
      await imageRef.set({ likes: 1, comments: [] });
    } else {
      await imageRef.update({ likes: admin.firestore.FieldValue.increment(1) });
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error liking image:', error);
    res.status(500).send('Error liking image');
  }
});


app.post('/comment/:imageId', async (req, res) => {
  try {
    const imageId = req.params.imageId;
    const { comment } = req.body;
    const timestamp = new Date().toLocaleString(); // Get current time

    const newComment = { text: comment, time: timestamp };

    const imageRef = db.collection('images').doc(imageId);
    await imageRef.update({
      comments: admin.firestore.FieldValue.arrayUnion(newComment),
    });

    res.status(200).json(newComment); // Send back the newly added comment
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).send('Error adding comment');
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
