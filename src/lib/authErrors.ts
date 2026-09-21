/** Turns a Firebase Auth error code into copy a person can act on. */
export function friendlyAuthError(code?: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password don't match.";
    case "auth/email-already-in-use":
      return "An account already exists for that email.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    case "auth/requires-recent-login":
      return "For security, please sign in again and retry.";
    case "auth/user-disabled":
      return "This account has been disabled. Contact an administrator.";
    default:
      return "Something went wrong. Please try again.";
  }
}

/** Same as above but for the "current password" field of the change-password form, where a
 *  credential error means the CURRENT password is wrong rather than "email and password don't match". */
export function friendlyChangePasswordError(code?: string): string {
  if (code === "auth/invalid-credential" || code === "auth/wrong-password") return "Your current password is incorrect.";
  return friendlyAuthError(code);
}
