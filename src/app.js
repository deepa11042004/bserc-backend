require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const authRoutes = require('./routes/authRoutes');
const workshopRoutes = require('./routes/workshopRoutes');
const workshopListRoutes = require('./routes/workshopListRoutes');
const mentorRoutes = require('./routes/mentorRoutes');
const internshipRoutes = require('./routes/internshipRoutes');
const summerSchoolRoutes = require('./routes/summerSchoolRoutes');
const institutionalRegistrationRoutes = require('./routes/institutionalRegistrationRoutes');
const mouRequestRoutes = require('./routes/mouRequestRoutes');
const advisoryRoutes = require('./routes/advisoryRoutes');
const collaborationRoutes = require('./routes/collaborationRoutes');
const apprenticeshipRoutes = require('./routes/apprenticeshipRoutes');
const speakerRoutes = require('./routes/speakerRoutes');
const industryCollaborationRoutes = require('./routes/industryCollaborationRoutes');
const heroSlideRoutes = require('./routes/heroSlideRoutes');
const footerNewsRoutes = require('./routes/footerNewsRoutes');
const announcementBannerRoutes = require('./routes/announcementBannerRoutes');
const featuredWorkshopSectionRoutes = require('./routes/featuredWorkshopSectionRoutes');
const contactQueryRoutes = require('./routes/contactQueryRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const userDashboardRoutes = require('./routes/userDashboardRoutes');
const projectListingRoutes = require('./routes/projectListingRoutes');
const adminUserRoutes = require('./routes/adminUserRoutes');
const errorHandler = require('./middleware/errorHandler');
const swaggerSpec = require('./config/swagger');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

const app = express();

// ── Reverse-proxy / load-balancer support ────────────────────────────────
// Required so express-rate-limit reads the real client IP from
// X-Forwarded-For instead of the proxy's IP (Nginx, ALB, CloudFront, etc.).
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

app.get('/', (req, res) => {
  res.send('API is running');
});

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ── Rate limiting ────────────────────────────────────────────────────────
// Strict limiter on auth-sensitive routes (login, register, OTP, password reset)
app.use('/auth', authLimiter);
// General limiter applied once – covers every /api/* and /api/user-dashboard/* route
app.use('/api', apiLimiter);

// ── Route registration ───────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/api', workshopRoutes);
app.use('/api', workshopListRoutes);
app.use('/api', mentorRoutes);
app.use('/api', internshipRoutes);
app.use('/api', summerSchoolRoutes);
app.use('/api', institutionalRegistrationRoutes);
app.use('/api', mouRequestRoutes);
app.use('/api', advisoryRoutes);
app.use('/api', collaborationRoutes);
app.use('/api', apprenticeshipRoutes);
app.use('/api', speakerRoutes);
app.use('/api', industryCollaborationRoutes);
app.use('/api', heroSlideRoutes);
app.use('/api', footerNewsRoutes);
app.use('/api', announcementBannerRoutes);
app.use('/api', featuredWorkshopSectionRoutes);
app.use('/api', contactQueryRoutes);
app.use('/api', ticketRoutes);
app.use('/api/user-dashboard', userDashboardRoutes);
app.use('/api', projectListingRoutes);
app.use('/api', adminUserRoutes);

app.use(errorHandler);

module.exports = app;

