# app.py
import os
import base64
import hashlib
import secrets
from urllib.parse import urlencode

from flask import Flask, session, redirect, request, jsonify, url_for, render_template_string
import requests
from dotenv import load_dotenv

load_dotenv()

# === CONFIG ===
CLIENT_ID = os.getenv("1403218436938666074")
CLIENT_SECRET = os.getenv("aE5FuiGpl-16hUPuxgloQdiuLOdiL_1U")  # optional if using PKCE
# The PUBLIC_BASE is where your backend runs (must be HTTPS in production)
# e.g. https://your-backend.example.com
PUBLIC_BASE = os.getenv("PUBLIC_BASE", "http://localhost:5000")
# The FRONTEND_BASE is where your frontend lives (e.g. GitHub Pages)
# e.g. https://yourusername.github.io/yourrepo
FRONTEND_BASE = os.getenv("https://HappyMonkey995.github.io/test", "http://localhost:5500")

# Scopes you want
SCOPES = ["identify", "email", "guids", "guilds.join", "gdm.join", "connections", "guilds.members.read", "bot"]  # adjust as needed

app = Flask(__name__)
app.secret_key = os.getenv("FLASK_SECRET", secrets.token_urlsafe(32))

# Use server-side session storage for production (Flask-Session etc).
# For simplicity we use flask default secure cookie sessions.

DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize?client_id=1403218436938666074&permissions=8&response_type=code&redirect_uri=https%3A%2F%2FHappyMonkey995.github.io%2Ftest%2Fcallback&integration_type=0&scope=identify+guilds+email+guilds.join+gdm.join+connections+guilds.members.read+bot"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"
DISCORD_API_ME = "https://discord.com/api/users/@me"

# --- Helpers for PKCE ---
def generate_code_verifier():
    # RFC 7636: 43-128 characters
    return base64.urlsafe_b64encode(secrets.token_bytes(64)).rstrip(b"=").decode("ascii")

def code_challenge_from_verifier(verifier: str):
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


@app.route("/")
def index():
    return (
        "Discord OAuth2 server. Endpoints: /login, /callback, /me, /logout\n"
        "Configure CLIENT_ID (and CLIENT_SECRET for server-side flow) and PUBLIC_BASE/FRONTEND_BASE."
    )

@app.route("/login")
def login():
    """
    Start the OAuth2 flow. Query param `pkce=1` will start a PKCE flow (no client_secret required).
    Example: /login?pkce=1&redirect_frontend=/after
    """
    use_pkce = request.args.get("pkce", "0") in ("1", "true", "yes")
    frontend_redirect = request.args.get("redirect_frontend", "/")  # where to send user after complete

    state = secrets.token_urlsafe(16)
    session['oauth_state'] = state
    session['frontend_redirect'] = frontend_redirect

    params = {
        "client_id": CLIENT_ID,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        # Redirect to backend callback (must be registered exactly in Discord app)
        "redirect_uri": f"{PUBLIC_BASE}/callback",
        "state": state,
        # prompt=consent (optional)
    }

    if use_pkce:
        verifier = generate_code_verifier()
        challenge = code_challenge_from_verifier(verifier)
        session['pkce_verifier'] = verifier
        params["code_challenge"] = challenge
        params["code_challenge_method"] = "S256"

    url = f"{DISCORD_AUTHORIZE_URL}?{urlencode(params)}"
    return redirect(url)


@app.route("/callback")
def callback():
    """Handle redirect from Discord. Exchanges code -> tokens and fetches user info."""
    err = request.args.get("error")
    if err:
        return f"OAuth error: {err}", 400

    code = request.args.get("code")
    state = request.args.get("state")
    if not code or not state:
        return "Missing code or state", 400

    if state != session.get("oauth_state"):
        return "Invalid state (possible CSRF)", 400

    # Prepare token exchange payload
    data = {
        "client_id": CLIENT_ID,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": f"{PUBLIC_BASE}/callback",
    }

    # If we have a CLIENT_SECRET in env, use it (server-side flow).
    # Otherwise, if we stored pkce_verifier, include it (PKCE flow).
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    if CLIENT_SECRET:
        data["client_secret"] = CLIENT_SECRET
    else:
        verifier = session.get("pkce_verifier")
        if not verifier:
            return "No client secret configured and no PKCE verifier present.", 400
        data["code_verifier"] = verifier

    token_resp = requests.post(DISCORD_TOKEN_URL, data=data, headers=headers)
    if token_resp.status_code != 200:
        # show body for debugging
        return f"Token exchange failed: {token_resp.status_code} {token_resp.text}", 400

    token_json = token_resp.json()
    access_token = token_json.get("access_token")
    refresh_token = token_json.get("refresh_token")
    # store tokens in session (or better — store in DB for long-term)
    session['token'] = token_json

    # Fetch user info
    user_resp = requests.get(DISCORD_API_ME, headers={"Authorization": f"Bearer {access_token}"})
    if user_resp.status_code != 200:
        return f"Failed to fetch user: {user_resp.status_code} {user_resp.text}", 400

    user = user_resp.json()
    # Save user to session (or database)
    session['user'] = user

    # Redirect to frontend. If frontend is on different origin, we cannot share session cookie,
    # so we can instead redirect with a short-lived one-time token or let the backend render a page.
    # For simplicity, we'll redirect back to FRONTEND_BASE with a short flag and the backend will
    # provide /me endpoint to fetch details (works if frontend can call backend API).
    frontend_redirect = session.get("frontend_redirect", "/")
    # build redirect URL on frontend with a success flag
    redirect_url = f"{FRONTEND_BASE}{frontend_redirect}?logged_in=1"
    return redirect(redirect_url)


@app.route("/me")
def me():
    """Return user info for the current session (JSON)."""
    if 'user' not in session:
        return jsonify({"error": "not_logged_in"}), 401
    return jsonify(session['user'])


@app.route("/logout")
def logout():
    session.clear()
    return "Logged out"

if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
