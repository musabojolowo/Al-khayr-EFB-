# Al-Khayr EFB Tournament System

A complete tournament management system built with vanilla JavaScript and Firebase Realtime Database. Features a public view for spectators and an authenticated admin panel for tournament management.

## Files

### Core Files
- **index.html** - Public tournament website (view-only)
- **style.css** - Shared styling for all pages
- **script.js** - Public website logic (reads from Realtime Database in real-time)
- **firebase.js** - Firebase configuration and utility functions
- **admin.html** - Admin dashboard (authentication required)
- **admin.js** - Admin logic and tournament management

## Features

### Public Website (index.html)
- ✅ Real-time tournament bracket display
- ✅ Match schedule with timestamps
- ✅ Current round tracking
- ✅ Champion display
- ✅ Countdown timer
- ✅ Statistics (teams, matches played, remaining teams)
- ✅ View-only (no editing capabilities)

### Admin Dashboard (admin.html)
- ✅ Email/Password authentication
- ✅ Tournament generation (32-team knockout)
- ✅ Team management
- ✅ Match result submission
- ✅ Automatic winner advancement
- ✅ Real-time updates across all pages
- ✅ Tournament reset functionality
- ✅ Countdown date/time configuration

## Firebase Setup

### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a new project"
3. Name it "EFB Tournament" and proceed
4. Disable Google Analytics (optional)
5. Wait for project creation

### 2. Enable Firebase Services

#### Enable Authentication
1. Navigate to **Authentication** → **Sign-in method**
2. Enable **Email/Password** provider
3. Go to **Users** tab and add an admin account:
   - Email: `admin@tournament.com`
   - Password: (create a strong password)

#### Enable Realtime Database
1. Navigate to **Realtime Database**
2. Click **Create database**
3. Choose **Start in test mode** or **Locked mode** depending on your setup
4. Select your preferred region
5. Click **Enable**

#### Set Realtime Database Rules
Use rules like:

```
{
  "rules": {
    "tournament": {
      ".read": true,
      ".write": "auth != null"
    },
    "matches": {
      ".read": true,
      ".write": "auth != null"
    }
  }
}
```

### 3. Get Firebase Configuration

1. Navigate to **Project Settings** (gear icon)
2. Scroll to "Your apps"
3. Click the web icon (`</>`)
4. Copy your Firebase config object

### 4. Update firebase.js

Replace the `firebaseConfig` object in `firebase.js` with your credentials:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

## Usage

### For Admins

1. Navigate to `/admin.html`
2. Login with your Firebase credentials
3. **Generate Tournament:**
   - Enter 32 team names (one per line)
   - Set the countdown date/time
   - Click "Generate Tournament"
4. **Submit Results:**
   - Select a pending match
   - Enter both teams' scores
   - Click "Submit Result"
   - Winner automatically advances to next round
5. **Monitor Progress:**
   - View real-time bracket updates
   - Track tournament statistics
   - See champion when tournament completes

### For Public/Spectators

1. Open `/index.html`
2. View the live tournament bracket
3. See all match information in real-time
4. Track progress as matches are completed
5. Cannot edit or modify any data

## File Structure

```
EFB tournament/
├── index.html          # Public website
├── admin.html          # Admin dashboard
├── style.css           # Shared styles
├── script.js           # Public logic (Realtime Database listener)
├── admin.js            # Admin logic
└── firebase.js         # Firebase config & utilities
```

## How It Works

### Real-Time Sync
- Both public and admin pages use Realtime Database listeners
- Changes made by admin instantly appear on public site
- Uses `onValue` for live updates

### Tournament Structure
- **32 teams** in Round of 32
- **16 matches** advancing to Round of 16
- **8 matches** advancing to Quarter Finals
- **4 matches** advancing to Semi Finals
- **2 matches** advancing to Final
- **1 champion**

### Automatic Advancement
1. Admin submits match result
2. Winning team automatically placed in next round
3. Next match teams populated instantly
4. All pages update in real-time

### Data Storage
All data stored in Realtime Database paths:
- `tournament/main-2026` - Main tournament object
- `matches/{matchId}` - Individual match objects

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Security Features

- ✅ Email/Password authentication
- ✅ Realtime Database security rules (public read, admin write)
- ✅ Session management
- ✅ Logout functionality

## Customization

### Change Tournament Size
Edit `firebase.js`:
- Modify `generateMatches()` function
- Adjust match distribution for different bracket sizes

### Customize Prize Pool
Edit `style.css` and `index.html`:
- Update prize amounts in HTML
- Modify styling as needed

### Change Colors/Branding
All colors are CSS variables in `style.css`:
```css
--primary: #00A8FF
--secondary: #00D4FF
--gold: #FFD700
```

## Troubleshooting

### "Permission denied" errors
- Check Realtime Database security rules
- Verify user is authenticated (for admin)
- Check Firebase console for error logs

### Real-time updates not showing
- Refresh the page
- Check browser console for errors
- Verify Realtime Database rules allow read access

### Admin login fails
- Verify email/password in Firebase Authentication
- Check browser's local storage is enabled
- Clear browser cache and try again

### Teams not advancing
- Verify match winner was selected correctly
- Check Realtime Database has write permissions
- Review console for error messages

## Support

For issues or questions, check:
1. Firebase console error logs
2. Browser developer console
3. Realtime Database paths and data
4. Security rules configuration

## License

Created for Al-Khayr EFB Tournament Management
