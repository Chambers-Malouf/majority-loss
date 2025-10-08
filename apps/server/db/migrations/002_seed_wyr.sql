-- 002_seed_wyr.sql
-- Seed initial "Would you rather" questions + options

/*
question_id |                           question_text                           | option_id |     option_text      
-------------+-------------------------------------------------------------------+-----------+----------------------
           1 | Would you rather, study in the morning or at night?               |         1 | morning
           1 | Would you rather, study in the morning or at night?               |         2 | night
           2 | Would you rather, have all in person or online classes?           |         3 | in person
           2 | Would you rather, have all in person or online classes?           |         4 | online
           3 | Would you rather, go to South Rec or Turner Center?               |         5 | South Rec
           3 | Would you rather, go to South Rec or Turner Center?               |         6 | Turner Center
           4 | Would you rather, never have to sleep or never have to eat again? |         7 | never sleep
           4 | Would you rather, never have to sleep or never have to eat again? |         8 | never eat
           5 | Would you rather, be blind or deaf?                               |         9 | blind
           5 | Would you rather, be blind or deaf?                               |        10 | deaf
           6 | Would you rather, never drive again or always be the driver?      |        11 | never drive
           6 | Would you rather, never drive again or always be the driver?      |        12 | always be the driver
           7 | Would you rather, code on paper or code with assembly?            |        13 | on paper
           7 | Would you rather, code on paper or code with assembly?            |        14 | assembly
           8 | Would you rather, be able to fly or be invisible?                 |        15 | fly
           8 | Would you rather, be able to fly or be invisible?                 |        16 | invisible
           9 | Would you rather, be rich or famous?                              |        17 | rich
           9 | Would you rather, be rich or famous?                              |        18 | famous
          10 | would you rather, drink Dr. Pepper or Coke?                       |        19 | Dr. Pepper
          10 | would you rather, drink Dr. Pepper or Coke?                       |        20 | Coke

*/

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

