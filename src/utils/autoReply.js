
// import Settings from "../models/Setting.js";

// /**
//  * Determine if auto-reply should fire
//  */
// export async function shouldAutoReply({ userId, message }) {
//   const settings = await Settings.findOne({ userId });
//   if (!settings || !settings.auto_reply_enabled) return false;

//   // Business hours enforcement
//   if (settings.business_hours_enabled) {
//     const now = new Date();

//     const [sh, sm] = settings.business_hours_start.split(":").map(Number);
//     const [eh, em] = settings.business_hours_end.split(":").map(Number);

//     const start = new Date();
//     start.setHours(sh, sm, 0, 0);

//     const end = new Date();
//     end.setHours(eh, em, 0, 0);

//     if (now < start || now > end) return false;
//   }

//   // Serious keyword filter
//   if (settings.serious_keywords.length) {
//     const lower = message.toLowerCase();
//     const match = settings.serious_keywords.some(k =>
//       lower.includes(k.toLowerCase())
//     );
//     if (!match) return false;
//   }

//   return true;
// }
