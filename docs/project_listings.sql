CREATE TABLE IF NOT EXISTS project_listings (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- Section 1: Personal & Institutional Details
  enrolment_number VARCHAR(100) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  primary_email VARCHAR(255) NOT NULL,
  alternative_email VARCHAR(255) NULL,
  whatsapp_number VARCHAR(30) NULL,
  institution VARCHAR(255) NOT NULL,
  department VARCHAR(255) NOT NULL,
  programme VARCHAR(40) NOT NULL,
  programme_other VARCHAR(255) NULL,

  -- Section 2: Registration Details
  is_registered TINYINT(1) NULL DEFAULT NULL,
  portal_name VARCHAR(255) NULL,
  registration_number VARCHAR(255) NULL,
  registration_date DATE NULL,

  -- Section 2: Publication Details
  is_published TINYINT(1) NULL DEFAULT NULL,
  publication_type JSON NULL,
  publication_title VARCHAR(500) NULL,
  publication_venue VARCHAR(500) NULL,
  publication_date DATE NULL,
  publication_link VARCHAR(1000) NULL,

  -- Section 2: Address Details
  address_line1 TEXT NOT NULL,
  city VARCHAR(120) NOT NULL,
  state VARCHAR(120) NOT NULL,
  pin_code VARCHAR(10) NOT NULL,
  country VARCHAR(80) NOT NULL DEFAULT 'India',

  -- Section 3: Project Basic Info
  project_title VARCHAR(500) NOT NULL,
  project_theme VARCHAR(60) NOT NULL,
  project_theme_other VARCHAR(255) NULL,
  project_level VARCHAR(40) NOT NULL,
  project_start_date DATE NOT NULL,
  project_end_date DATE NULL,

  -- Section 4: Project Description
  project_objective TEXT NOT NULL,
  project_methodology TEXT NOT NULL,
  project_outcome TEXT NOT NULL,

  -- Section 5: Thesis / Dissertation Link
  is_thesis_linked TINYINT(1) NULL DEFAULT NULL,
  thesis_title VARCHAR(500) NULL,
  thesis_degree VARCHAR(255) NULL,
  thesis_supervisor VARCHAR(255) NULL,
  thesis_institution VARCHAR(255) NULL,

  -- Section 6: Collaboration Preferences
  seeking_collaborators TINYINT(1) NULL DEFAULT NULL,
  collaborator_types JSON NULL,
  collaboration_types JSON NULL,
  collaboration_other VARCHAR(500) NULL,

  -- Section 7: Funding & Support
  open_to_funding TINYINT(1) NULL DEFAULT NULL,
  funding_sources JSON NULL,
  funding_other VARCHAR(500) NULL,
  estimated_budget VARCHAR(120) NULL,
  current_support TEXT NULL,

  -- Section 8: Document & Link Details
  synopsis_link VARCHAR(1000) NULL,
  github_link VARCHAR(1000) NULL,
  drive_link VARCHAR(1000) NULL,
  demo_link VARCHAR(1000) NULL,
  supporting_doc_path VARCHAR(500) NULL,
  supporting_doc_mime_type VARCHAR(100) NULL,
  supporting_doc_file_name VARCHAR(255) NULL,

  -- Section 9: Contact & Additional
  preferred_contact JSON NULL,
  collaboration_requirements TEXT NULL,
  additional_remarks TEXT NULL,

  -- Section 10: Declaration
  declaration_accepted TINYINT(1) NOT NULL DEFAULT 0,

  -- Metadata
  submission_type VARCHAR(40) NOT NULL DEFAULT 'project_listing',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Indexes
  INDEX idx_project_listings_email (primary_email),
  INDEX idx_project_listings_created_at (created_at),
  INDEX idx_project_listings_theme (project_theme)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
