CREATE TABLE IF NOT EXISTS announcement_banners (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section VARCHAR(40) NOT NULL,
  title VARCHAR(255) NOT NULL,
  link TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  position INT NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_announcement_banners_section_active_position (section, is_active, position),
  INDEX idx_announcement_banners_position (position)
);
