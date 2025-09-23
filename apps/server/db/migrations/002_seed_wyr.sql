-- 002_seed_wyr.sql
-- Seed initial "Would you rather" questions + options

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, study in the morning or at night?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'morning', 1),
  ((SELECT id FROM q), 'night', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, have all in person or online classes?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'in person', 1),
  ((SELECT id FROM q), 'online', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, go to South Rec or Turner Center?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'South Rec', 1),
  ((SELECT id FROM q), 'Turner Center', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, never have to sleep or never have to eat again?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'never sleep', 1),
  ((SELECT id FROM q), 'never eat', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, be blind or deaf?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'blind', 1),
  ((SELECT id FROM q), 'deaf', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, never drive again or always be the driver?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'never drive', 1),
  ((SELECT id FROM q), 'always be the driver', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, code on paper or code with assembly?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'on paper', 1),
  ((SELECT id FROM q), 'assembly', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, be able to fly or be invisible?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'fly', 1),
  ((SELECT id FROM q), 'invisible', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, be drunk or high?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'drunk', 1),
  ((SELECT id FROM q), 'high', 2);

WITH q AS (
  INSERT INTO questions (text) VALUES
    ('Would you rather, be whomped or bagged out?')
  RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
VALUES 
  ((SELECT id FROM q), 'whomped', 1),
  ((SELECT id FROM q), 'bagged out', 2);