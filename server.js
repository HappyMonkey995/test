require('dotenv').config();
const express = require('express');
const session = require('express-session');
const fetch = require('node-fetch');
const qs = require('qs');
const path = require('path');

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  SESSION_SECRET,
  PORT = 3000
} = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !SESSION_SECRET) {
  console.error("Missing required env vars. See .env.example");
  process.exit(1);
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set true if using HTTPS
}));

// Home
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user, clientId: CLIENT_ID, redirectUri: REDIRECT_URI });
});

// Start OAuth2 flow
app.get('/auth/discord', (req, res) => {
  const scopes = ['identify'].join('%20');
  const redirect = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${scopes}`;
  res.redirect(redirect);
});

// OAuth2 callback
app.get('/auth/discord/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code provided');

  try {
    const data = {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      scope: 'identify'
    };

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      body: qs.stringify(data),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('Token response error:', text);
      return res.status(500).send('Failed to exchange token');
    }

    const tokenJson = await tokenRes.json();
    const accessToken = tokenJson.access_token;

    // Get user
    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!userRes.ok) {
      const text = await userRes.text();
      console.error('User fetch error:', text);
      return res.status(500).send('Failed to fetch user');
    }

    const user = await userRes.json();
    // Save to session
    req.session.user = {
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      avatar: user.avatar,
      // store tokens if you want to call additional API later
      access_token: accessToken,
      token_type: tokenJson.token_type,
      scope: tokenJson.scope
    };

    res.redirect('/profile');
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth error');
  }
});

// Profile
app.get('/profile', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.render('profile', { user: req.session.user });
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
