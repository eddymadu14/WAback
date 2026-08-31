
export const PLAN_CONFIG = {
  free: {
    plan: "free",
    billingStatus: "trial",
    limits: {
      broadcasts: 5,
      templates: 3,
      autoReplies: 3,
    },
  },

  min: {
    plan: "min",
    billingStatus: "active",
    limits: {
      broadcasts: 50,
      templates: 20,
      autoReplies: 20,
    },
  },

  max: {
    plan: "max",
    billingStatus: "active",
    limits: {
      broadcasts: 500,
      templates: 200,
      autoReplies: 200,
    },
  },
};
