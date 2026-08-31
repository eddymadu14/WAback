import { getDashboardAnalytics } from "../services/dashboard.service.js";

export async function getDashboard(req, res) {
  try {
    const userId = req.user.id;

    const data = await getDashboardAnalytics(userId);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load dashboard analytics" });
  }
}
