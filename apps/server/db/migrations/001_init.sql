-- initializing the original tables

-- 1) users: represents persitent accounts (may implement later, not needed now)
CREATE TABLE IF NOT EXISTS users(
    id              BIGSERIAL PRIMARY KEY,
    display_name    TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEAFULT NOW()
);

-- 2) games: represents each game/lobby
CREATE TABLE IF NOT EXISTS games(
    id              BIGSERIAL PRIMARY KEY,
    code            TEXT NOT NULL UNIQUE,
    host_user_id    BIGINT REFERENCES users(id),
    status          TEXT NOT NULL DEFAULT 'waiting',
    max_points      INT NOT NULL DEFAULT 5,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_code ON games(code);

-- 3) player_game: represents each user per game
CREATE TABLE IF NOT EXISTS player_game(
    id              BIGSERIAL PRIMARY KEY,
    game_id         BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    display_name    TEXT NOT NULL,
    score           INT NOT NULL DEFAULT 0,
    is_eliminated   BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE          (game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_player_game_game ON player_game(game_id);

-- 4) questions: represents all the questions that will be asked
CREATE TABLE IF NOT EXISTS questions(
    id              BIGSERIAL PRIMARY KEY,
    text            TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- 5) options: represents all the answer options to questions
CREATE TABLE IF NOT EXISTS options(
    id              BIGSERIAL PRIMARY KEY,
    question_id     BIGINT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    text            TEXT NOT NULL,
    sort_order      INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_options_questions ON options(question_id);

--6) rounds: represents all the rounds per game
CREATE TABLE IF NOT EXISTS rounds(
    id              BIGSERIAL PRIMARY KEY,
    game_id         BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    question_id     BIGINT NOT NULL REFERENCES questions(id),
    round_number    INT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    winning_option_id   BIGINT REFERENCES options(id),
    minority_count  INT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rounds_game_roundnum ON rounds(game_id, round_number);

--7) votes: represents the votes by players per round
CREATE TABLE IF NOT EXISTS votes(
    id             BIGSERIAL PRIMARY KEY,
    round_id       BIGINT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    player_game_id BIGINT NOT NULL REFERENCES player_game(id) ON DELETE CASCADE,
    option_id      BIGINT NOT NULL REFERENCES options(id) ON DELETE RESTRICT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (round_id, player_game_id)
);

CREATE INDEX IF NOT EXISTS idx_votes_round ON votes(round_id);
CREATE INDEX IF NOT EXISTS idx_votes_option ON votes(option_id);

