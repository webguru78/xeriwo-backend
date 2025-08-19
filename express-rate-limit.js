const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit'); // helper for IPv6

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  keyGenerator: (req, res) => ipKeyGenerator(req), // ✅ IPv6-safe key generator
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
