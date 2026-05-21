-- Create tables for featured workshop section and cards.
-- Stores section content plus six card images/titles in S3.

CREATE TABLE IF NOT EXISTS featured_workshop_section (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  background_path VARCHAR(1024) NULL,
  background_file_name VARCHAR(255) NULL,
  background_storage ENUM('s3') NOT NULL DEFAULT 's3',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_featured_workshop_section_active (is_active)
);

CREATE TABLE IF NOT EXISTS featured_workshop_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  section_id INT NOT NULL,
  title VARCHAR(120) NOT NULL,
  image_path VARCHAR(1024) NULL,
  image_file_name VARCHAR(255) NULL,
  image_storage ENUM('s3') NOT NULL DEFAULT 's3',
  position INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_featured_workshop_cards_section_position (section_id, position),
  INDEX idx_featured_workshop_cards_active_position (is_active, position),
  UNIQUE KEY uniq_featured_workshop_cards_section_position (section_id, position)
);
