-- =============================================
-- Memorae Clone - Supabase Database Schema
-- =============================================
-- This schema includes tables for users, reminders, lists, 
-- calendar integrations, and notification history
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  whatsapp_id VARCHAR(255) UNIQUE NOT NULL, -- Format: 919876543210@s.whatsapp.net
  phone_number VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  timezone VARCHAR(50) DEFAULT 'UTC',
  language VARCHAR(10) DEFAULT 'en',
  default_reminder_time TIME DEFAULT '09:00:00',
  
  -- User settings
  notification_enabled BOOLEAN DEFAULT true,
  advance_notice_minutes INTEGER DEFAULT 15,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  quiet_hours_days TEXT[], -- Array of days: ['monday', 'tuesday', ...]
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT valid_phone_number CHECK (phone_number ~ '^\+?[1-9]\d{1,14}$')
);

CREATE INDEX idx_users_whatsapp_id ON users(whatsapp_id);
CREATE INDEX idx_users_phone_number ON users(phone_number);
CREATE INDEX idx_users_last_active ON users(last_active_at DESC);

-- =============================================
-- REMINDERS TABLE
-- =============================================
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Reminder details
  title TEXT NOT NULL,
  notes TEXT,
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Recurrence
  is_recurring BOOLEAN DEFAULT false,
  recurrence_rule TEXT, -- Cron expression or RRULE format
  recurrence_end_date TIMESTAMP WITH TIME ZONE,
  
  -- Priority and status
  priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'snoozed')),
  
  -- Snooze functionality
  snoozed_until TIMESTAMP WITH TIME ZONE,
  snooze_count INTEGER DEFAULT 0,
  
  -- Completion tracking
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes
  CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'completed', 'cancelled', 'snoozed'))
);

CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_reminder_time ON reminders(reminder_time);
CREATE INDEX idx_reminders_status ON reminders(status);
CREATE INDEX idx_reminders_priority ON reminders(priority);
CREATE INDEX idx_reminders_user_status ON reminders(user_id, status);
CREATE INDEX idx_reminders_upcoming ON reminders(user_id, reminder_time) WHERE status = 'pending';

-- =============================================
-- LISTS TABLE
-- =============================================
CREATE TABLE lists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- List details
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50), -- Emoji or icon identifier
  color VARCHAR(7), -- Hex color code
  
  -- List settings
  is_archived BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Unique constraint
  CONSTRAINT unique_user_list_name UNIQUE(user_id, name)
);

CREATE INDEX idx_lists_user_id ON lists(user_id);
CREATE INDEX idx_lists_user_archived ON lists(user_id, is_archived);

-- =============================================
-- LIST ITEMS TABLE
-- =============================================
CREATE TABLE list_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  list_id UUID NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  
  -- Item details
  content TEXT NOT NULL,
  notes TEXT,
  
  -- Status
  is_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  
  -- Ordering
  position INTEGER DEFAULT 0,
  
  -- Optional reminder link
  reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_list_items_list_id ON list_items(list_id);
CREATE INDEX idx_list_items_position ON list_items(list_id, position);
CREATE INDEX idx_list_items_completed ON list_items(list_id, is_completed);

-- =============================================
-- CALENDAR CONNECTIONS TABLE
-- =============================================
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Provider details
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('google', 'outlook', 'apple')),
  provider_account_id VARCHAR(255),
  provider_account_email VARCHAR(255),
  
  -- OAuth tokens (encrypted in application layer)
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Calendar settings
  calendar_id VARCHAR(255), -- Specific calendar ID from provider
  sync_enabled BOOLEAN DEFAULT true,
  auto_import_events BOOLEAN DEFAULT false,
  
  -- Metadata
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  
  -- Unique constraint
  CONSTRAINT unique_user_provider UNIQUE(user_id, provider)
);

CREATE INDEX idx_calendar_connections_user_id ON calendar_connections(user_id);
CREATE INDEX idx_calendar_connections_provider ON calendar_connections(provider);

-- =============================================
-- NOTIFICATION HISTORY TABLE
-- =============================================
CREATE TABLE notification_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Notification details
  type VARCHAR(20) NOT NULL CHECK (type IN ('reminder', 'shared', 'system', 'calendar')),
  content TEXT NOT NULL,
  
  -- Related entities
  reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,
  list_id UUID REFERENCES lists(id) ON DELETE SET NULL,
  
  -- Delivery details
  recipient_whatsapp_id VARCHAR(255), -- For shared reminders
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_notification_history_user_id ON notification_history(user_id);
CREATE INDEX idx_notification_history_type ON notification_history(type);
CREATE INDEX idx_notification_history_status ON notification_history(status);
CREATE INDEX idx_notification_history_created_at ON notification_history(created_at DESC);

-- =============================================
-- CONVERSATION CONTEXT TABLE (for AI)
-- =============================================
CREATE TABLE conversation_context (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Context data
  message_history JSONB DEFAULT '[]'::jsonb, -- Array of recent messages
  current_intent VARCHAR(50),
  pending_action JSONB, -- Stores incomplete actions
  
  -- Session management
  session_id VARCHAR(255),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour',
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_conversation_context_user_id ON conversation_context(user_id);
CREATE INDEX idx_conversation_context_session ON conversation_context(session_id);
CREATE INDEX idx_conversation_context_expires ON conversation_context(expires_at);

-- =============================================
-- SHARED REMINDERS TABLE
-- =============================================
CREATE TABLE shared_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reminder_id UUID NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Recipient details
  recipient_whatsapp_id VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  
  -- Metadata
  shared_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_shared_reminders_reminder_id ON shared_reminders(reminder_id);
CREATE INDEX idx_shared_reminders_sender ON shared_reminders(sender_user_id);

-- =============================================
-- MEDIA ATTACHMENTS TABLE
-- =============================================
CREATE TABLE media_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Media details
  media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'audio', 'video', 'document')),
  file_url TEXT NOT NULL,
  file_size INTEGER, -- in bytes
  mime_type VARCHAR(100),
  
  -- Processing results
  transcription TEXT, -- For audio files
  extracted_text TEXT, -- For images (OCR)
  extracted_data JSONB, -- Structured data (dates, tasks, etc.)
  
  -- Related entities
  reminder_id UUID REFERENCES reminders(id) ON DELETE SET NULL,
  list_item_id UUID REFERENCES list_items(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_media_attachments_user_id ON media_attachments(user_id);
CREATE INDEX idx_media_attachments_reminder_id ON media_attachments(reminder_id);
CREATE INDEX idx_media_attachments_type ON media_attachments(media_type);

-- =============================================
-- FUNCTIONS AND TRIGGERS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all relevant tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lists_updated_at BEFORE UPDATE ON lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_list_items_updated_at BEFORE UPDATE ON list_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_context_updated_at BEFORE UPDATE ON conversation_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to auto-complete list item when reminder is completed
CREATE OR REPLACE FUNCTION sync_list_item_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE list_items 
    SET is_completed = true, completed_at = NOW()
    WHERE reminder_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_reminder_to_list_item AFTER UPDATE ON reminders
  FOR EACH ROW EXECUTE FUNCTION sync_list_item_completion();

-- =============================================
-- RPC: Claim due reminders atomically (de-dup across workers)
-- =============================================

-- Claims up to batch_size reminders that are due at or before now_ts.
-- Uses FOR UPDATE SKIP LOCKED to avoid double-processing across instances.
CREATE OR REPLACE FUNCTION claim_due_reminders(
  now_ts TIMESTAMPTZ,
  batch_size INTEGER DEFAULT 50
)
RETURNS SETOF reminders AS $$
BEGIN
  RETURN QUERY
    WITH c AS (
      SELECT id
      FROM reminders
      WHERE status = 'pending' AND reminder_time <= now_ts
      ORDER BY reminder_time ASC
      FOR UPDATE SKIP LOCKED
      LIMIT batch_size
    )
    UPDATE reminders r
    SET updated_at = NOW()
    FROM c
    WHERE r.id = c.id
    RETURNING r.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Users can only access their own data)
CREATE POLICY users_policy ON users
  FOR ALL USING (auth.uid()::text = id::text);

CREATE POLICY reminders_policy ON reminders
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY lists_policy ON lists
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY list_items_policy ON list_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM lists 
      WHERE lists.id = list_items.list_id 
      AND auth.uid()::text = lists.user_id::text
    )
  );

CREATE POLICY calendar_connections_policy ON calendar_connections
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY notification_history_policy ON notification_history
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY conversation_context_policy ON conversation_context
  FOR ALL USING (auth.uid()::text = user_id::text);

CREATE POLICY shared_reminders_policy ON shared_reminders
  FOR ALL USING (auth.uid()::text = sender_user_id::text);

CREATE POLICY media_attachments_policy ON media_attachments
  FOR ALL USING (auth.uid()::text = user_id::text);

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- View for upcoming reminders
CREATE VIEW upcoming_reminders AS
SELECT 
  r.*,
  u.whatsapp_id,
  u.timezone,
  EXTRACT(EPOCH FROM (r.reminder_time - NOW())) / 60 AS minutes_until
FROM reminders r
JOIN users u ON r.user_id = u.id
WHERE r.status = 'pending'
  AND r.reminder_time > NOW()
ORDER BY r.reminder_time ASC;

-- View for user statistics
CREATE VIEW user_stats AS
SELECT 
  u.id,
  u.whatsapp_id,
  COUNT(DISTINCT r.id) AS total_reminders,
  COUNT(DISTINCT CASE WHEN r.status = 'pending' THEN r.id END) AS pending_reminders,
  COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) AS completed_reminders,
  COUNT(DISTINCT l.id) AS total_lists,
  COUNT(DISTINCT li.id) AS total_list_items,
  COUNT(DISTINCT CASE WHEN li.is_completed THEN li.id END) AS completed_list_items
FROM users u
LEFT JOIN reminders r ON u.id = r.user_id
LEFT JOIN lists l ON u.id = l.user_id
LEFT JOIN list_items li ON l.id = li.list_id
GROUP BY u.id, u.whatsapp_id;

-- =============================================
-- SAMPLE DATA (Optional - for testing)
-- =============================================

-- Uncomment to insert sample data
/*
INSERT INTO users (whatsapp_id, phone_number, name, timezone) VALUES
  ('919876543210@s.whatsapp.net', '+919876543210', 'Test User', 'Asia/Kolkata');
*/

-- =============================================
-- COMMENTS
-- =============================================

COMMENT ON TABLE users IS 'Stores user information and preferences';
COMMENT ON TABLE reminders IS 'Stores all user reminders with recurrence support';
COMMENT ON TABLE lists IS 'User-created lists for organizing tasks';
COMMENT ON TABLE list_items IS 'Individual items within lists';
COMMENT ON TABLE calendar_connections IS 'OAuth connections to external calendars';
COMMENT ON TABLE notification_history IS 'Log of all notifications sent';
COMMENT ON TABLE conversation_context IS 'AI conversation state management';
COMMENT ON TABLE shared_reminders IS 'Reminders shared with other WhatsApp users';
COMMENT ON TABLE media_attachments IS 'Media files with OCR/transcription results';

-- =============================================
-- END OF SCHEMA
-- =============================================
