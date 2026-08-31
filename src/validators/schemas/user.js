import Joi from "joi";

// 🟢 Registration validation schema
export const registerSchema = Joi.object({
  name: Joi.string().trim() .pattern(/^[A-Za-z\s]+$/).min(6).max(30).required().messages({
    "string.empty": "Name is required",
    "string.min": "Name must be at least 6 characters",
    "string.pattern.base": "Name must contain only letters and spaces.",
  }),

  username: Joi.string()
  .alphanum()
  .min(3)
  .max(20)
  .messages({
    "string.alphanum": "Username can only contain letters and numbers.",
  }),

  email: Joi.string().email().required().messages({
    "string.email": "Enter a valid Email",
    "string.empty": "Email is required",
  }),

  password: Joi.string().min(6).max(30).required()
  .pattern(new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]{8,}$"))
  .messages({
    "string.min": "Password must be at least 6 characters",
    "string.empty": "Password is required",
     "string.pattern.base": "Password must include uppercase, lowercase, number, and special character.",
  }),
});