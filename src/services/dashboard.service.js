// import { Lead } from "../models/Lead.js";
// import { AutoReply } from "../models/autoReply.js";
// import Broadcast  from "../models/Broadcast.js";

// export async function getDashboardAnalytics(userId) {
//   const now = new Date();
//   const sevenDaysAgo = new Date();
//   sevenDaysAgo.setDate(now.getDate() - 6);

//   // 1️⃣ Total Leads
//   const totalLeads = await Lead.countDocuments({ userId });

//   // 2️⃣ Serious Leads
//   const seriousLeads = await Lead.countDocuments({
//     userId,
//     isSerious: true,
//   });

//   // 3️⃣ Auto replies sent
//   const autoRepliesSent = await AutoReply.countDocuments({ userId });

//   // 4️⃣ Broadcasts
//   const broadcasts = await Broadcast.countDocuments({ userId });

//   // 5️⃣ Lead growth (last 7 days)
//   const leadGrowth = await Lead.aggregate([
//     {
//       $match: {
//         userId,
//         createdAt: { $gte: sevenDaysAgo },
//       },
//     },
//     {
//       $group: {
//         _id: {
//           $dateToString: { format: "%a", date: "$createdAt" },
//         },
//         leads: { $sum: 1 },
//       },
//     },
//     {
//       $sort: { "_id": 1 },
//     },
//   ]);

//   // Normalize days (Mon–Sun)
//   const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
//   const leadGrowthMap = Object.fromEntries(
//     leadGrowth.map((d) => [d._id, d.leads])
//   );

//   const leadGrowthData = days.map((day) => ({
//     name: day,
//     leads: leadGrowthMap[day] || 0,
//   }));

//   // 6️⃣ Conversion stats
//   const conversionStats = await Lead.aggregate([
//     { $match: { userId } },
//     {
//       $group: {
//         _id: "$status",
//         value: { $sum: 1 },
//       },
//     },
//   ]);

//   return {
//     stats: {
//       totalLeads,
//       seriousLeads,
//       autoRepliesSent,
//       broadcasts,
//     },
//     leadGrowth: leadGrowthData,
//     conversion: conversionStats,
//   };
// }
