--1-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, study in the morning or at night?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'morning', 1 FROM q 
UNION ALL 
SELECT id, 'night', 2 FROM q;
--2-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, have all in person or online classes?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'in person', 1 FROM q 
UNION ALL 
SELECT id, 'online', 2 FROM q;
--3-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, go to South Rec or Turner Center?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'South Rec', 1 FROM q 
UNION ALL 
SELECT id, 'Turner Center', 2 FROM q;
--4-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, never have to sleep or never have to eat again?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'never sleep', 1 FROM q 
UNION ALL 
SELECT id, 'never eat', 2 FROM q;
--5-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, be blind or deaf?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'blind', 1 FROM q 
UNION ALL 
SELECT id, 'deaf', 2 FROM q;
--6-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, never drive again or always be the driver?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'never drive', 1 FROM q 
UNION ALL 
SELECT id, 'always be the driver', 2 FROM q;
--7-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, code on paper or code with assembly?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'on paper', 1 FROM q 
UNION ALL 
SELECT id, 'assembly', 2 FROM q;
--8-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, be able to fly or be invisible?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'fly', 1 FROM q 
UNION ALL 
SELECT id, 'invisible', 2 FROM q;
--9-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, be drunk or high?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'drunk', 1 FROM q 
UNION ALL 
SELECT id, 'high', 2 FROM q;
--10-----------------------------------------------------------------------------------------
WITH q AS (
    INSERT INTO questions (text)
    VALUES ('Would you rather, be whomped or bagged out?')
    RETURNING id
)
INSERT INTO options (question_id, text, sort_order)
SELECT id, 'whomped', 1 FROM q 
UNION ALL 
SELECT id, 'bagged out', 2 FROM q;