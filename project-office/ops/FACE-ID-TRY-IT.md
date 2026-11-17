# Trying "sign in with Face ID" (for Simon)

**What it is:** after someone signs in with their email once, their phone can let them back in with Face ID or a
fingerprint. The email sign-in stays exactly as it is, so nobody is ever locked out. Their face or fingerprint never
leaves their phone. We only keep a "public key", which is like a lock that their phone holds the only key to.

**When you can try it:** once this change is merged and deployed to snickerdoodle.co.uk. It only works on the real
web address, not on a copy of the site on another address.

## On your iPhone

1. Open **snickerdoodle.co.uk** in Safari, or in the snickerdoodle app on your home screen. Sign in with your email
   the usual way.
2. On your keepsake home you'll see a small card: **"skip the email next time?"**. Tap **use Face ID**.
3. Your iPhone asks to save a passkey for snickerdoodle.co.uk. Tap **Continue** and look at the phone. The card then
   says **"all set"**.
4. Now test it. Tap the **Account** tab, scroll down, and tap **log out**.
5. Go to sign in again. At the top there's now a button that says **sign in with Face ID**. Tap it, look at the phone,
   and you're in. No email this time.
6. On the **Account** page, under **sign in with Face ID**, you'll see "an iphone", the date you added it, and a
   **remove** button.

If the iPhone doesn't offer to save it: open **Settings → your name → iCloud → Passwords and Keychain** and switch it
on. It's then on your iPad and Mac too.

## On an Android phone

1. Open **snickerdoodle.co.uk** in **Chrome** and sign in with your email.
2. On the card, tap **use your fingerprint**. Chrome offers to save a passkey in Google Password Manager. Touch the
   fingerprint sensor, or use your screen lock.
3. Log out from the **Account** tab, then sign in again with **sign in with your fingerprint**.

The phone needs a screen lock (PIN, pattern or fingerprint) set up, and Chrome needs to be signed in to a Google
account.

## Good to know

- **"not now"** on the card means that phone won't ask again. You can still add it any time from the Account page
  (**add Face ID on this device**).
- If the Account page says **"sign in again first"**, that's on purpose. Adding Face ID needs a sign-in in the last
  15 minutes, so a child on a tablet that stays signed in can't add their own face to your account.
- **remove** works straight away. That phone goes back to asking for the email. The passkey may still be listed in the
  phone's own Passwords app until you delete it there, but it won't open snickerdoodle any more.
- When you remove someone from your family, or they close their account, their Face ID sign-ins are deleted along with
  their sign-ins on every device.
- On a computer it says **Windows Hello** or **Touch ID** instead, and works the same way.
- If anything looks wrong, the email sign-in always works.
