-- ============================================================================
-- CyberCarnival Production Event Seeding Script
-- Seeds the 11 legitimate CyberCarnival technical & non-technical events into PostgreSQL.
-- Safe to execute repeatedly: uses ON CONFLICT (id) DO UPDATE.
-- ============================================================================

BEGIN;

INSERT INTO events (
    id, name, category, tag, description, poster_url, venue, event_date, event_time,
    fee, fee_amount, min_team_size, max_team_size, max_teams, prize, active, registration_open
) VALUES
(
    'fb2393db-06d8-402b-8b33-c527edf1e88e',
    'CYBER CONCLAVE 26',
    'NON-TECHNICAL',
    'PANEL',
    'Where industry meets innovation. Cyber Conclave brings top cybersecurity experts, ethical hackers, and tech leaders together for powerful panel discussions on the future of digital security. From AI-driven threats to building resilient digital infrastructure — get real insights from professionals shaping the next decade of cybersecurity.',
    '/assets/posters/84e4291b11274a518b179c48100d0ab7.jpg',
    'Geetham Auditorium',
    '7th of October',
    'After the inauguration',
    '₹200',
    20000,
    1, 1, NULL, 'N/A', TRUE, TRUE
),
(
    'edbc917c-c125-4b7d-a2c7-6e8d830adcf7',
    'WORKSHOPS',
    'TECHNICAL',
    'HANDS-ON',
    NULL,
    '/assets/posters/59aa5974fea3439798728cbbedbf5257.jpg',
    'SRM RAMAPURAM',
    '7 OCTOBER',
    '10:00 — 1:00',
    NULL, NULL, NULL, NULL, NULL, NULL, TRUE, TRUE
),
(
    'a48cfd98-9c73-49cc-a21c-e4bb8b5167d8',
    'PAPER PRESENTATION',
    'TECHNICAL',
    'RESEARCH',
    'Showcase your research, innovative ideas, and technical expertise through an engaging Paper Presentation competition. Participants are invited to present original concepts, research findings, emerging technologies, case studies, or problem-solving approaches across various domains of Computer Science and related fields.',
    '/assets/posters/aa55ba4e2d454774a1b225461491b9b5.jpg',
    'SRM RAMAPURAM',
    '7 — 8 OCTOBER',
    NULL,
    '₹150 PER TEAM',
    15000,
    1, 3, NULL, '1st Prize: ₹2,000 | 2nd Prize: ₹1,000', TRUE, TRUE
),
(
    '20a7d77d-ba14-4fa4-a06e-25d44fa12f52',
    'CAPTURE THE FLAG',
    'TECHNICAL',
    'COMPETITION',
    'Put your cybersecurity skills to the ultimate test in a 6-hour Capture The Flag (CTF) competition featuring hands-on challenges inspired by real-world security scenarios. Participants will identify vulnerabilities, analyze systems, solve security problems, and capture hidden flags across multiple cybersecurity domains.',
    '/assets/posters/0f2f13717f064841b9ea6c0cea057590.jpg',
    'SRM RAMAPURAM',
    '7 — 8 OCTOBER',
    NULL,
    '₹300 PER TEAM',
    30000,
    1, 2, NULL, '1st Prize: ₹2,000 | 2nd Prize: ₹1,000', TRUE, TRUE
),
(
    '176a97a5-227c-4c21-acd3-ab0cb4c81844',
    'BUG BOUNTY',
    'TECHNICAL',
    'COMPETITION',
    'Get ready for an exciting Bug Bounty where participants solve hands-on security challenges by identifying vulnerabilities and capturing flags. Inspired by challenge-based Capture-the-Flag (CTF) formats, the event features real-world scenarios with varying difficulty levels and a competitive leaderboard to test participants'' cybersecurity skills.',
    '/assets/posters/86ca9a454b1445c191da11c1fab7167f.jpg',
    'SRM RAMAPURAM',
    '7 — 8 OCTOBER',
    NULL,
    '₹200 PER TEAM',
    20000,
    1, 2, NULL, '1st Prize: ₹2,000 | 2nd Prize: ₹1,000', TRUE, TRUE
),
(
    'f05b9c60-447b-4cd4-8e47-e3dbf1b5714f',
    'RED TEAM × BLUE TEAM',
    'TECHNICAL',
    'COMPETITION',
    'Red Team vs Blue Team is a cybersecurity attack-and-defense competition where participants experience the offensive and defensive sides of cybersecurity in a realistic, controlled environment.',
    '/assets/posters/a28952d1003e4077b386f3527e6b20a8.jpg',
    'TBD',
    'TBD',
    NULL,
    '₹300 PER TEAM',
    30000,
    2, 3, NULL, '1st Prize: ₹2,000 | 2nd Prize: ₹1,000', TRUE, TRUE
),
(
    'b8911467-dc89-4a4d-ac0d-553abc572264',
    'TOOL EXPO',
    'TECHNICAL',
    'EXHIBITION',
    'Tools Expo is a platform for students to showcase innovative cybersecurity tools and solutions developed by them. Participants can bring their own tools, explain the problem they aim to solve, and demonstrate how their solution works.',
    '/assets/posters/436ff427c63941328c46c3e8e8e7b95c.jpg',
    'SRM RAMAPURAM',
    '7 — 8 OCTOBER',
    NULL,
    '₹200 PER TEAM',
    20000,
    1, 3, NULL, '1st Prize: ₹2,000 | 2nd Prize: ₹1,000', TRUE, TRUE
),
(
    '51faf430-d457-41e8-b29b-af829fc2147d',
    'BEHIND THE CRIME',
    'NON-TECHNICAL',
    'NON-TECHNICAL',
    'Behind the Crime is a non-technical, mystery-based event that challenges participants to analyze clues, connect evidence, identify suspects, and uncover the hidden story behind a crime.',
    '/assets/posters/18cca6d719534fb99dff76ab2b2bc3f0.jpg',
    'TBD',
    'TBD',
    NULL,
    '₹200 PER TEAM',
    20000,
    3, 4, NULL, '1st Prize: ₹1,500 | 2nd Prize: ₹750', TRUE, TRUE
),
(
    'b3362658-7d6d-4362-87d5-275a2b715066',
    'SHIPWRECK',
    'NON-TECHNICAL',
    'NON-TECHNICAL',
    'Participants are assigned different characters with specific backgrounds, roles, or abilities and placed in a simulated shipwreck scenario with limited survival resources.',
    '/assets/posters/16e50a56c2e141d79b9a33a33a6f8b46.jpg',
    'TBD',
    'TBD',
    NULL,
    '₹150 PER PARTICIPANT',
    15000,
    1, 1, NULL, '1st Place: ₹1,000 | 2nd Place: ₹500', TRUE, TRUE
),
(
    '495ef9df-4b08-4040-ab78-3b1740b44dcb',
    'SHARK TANK',
    'NON-TECHNICAL',
    'NON-TECHNICAL',
    'Shark Tank is an entrepreneurship-based competition where participants pitch innovative startup ideas before a panel of judges acting as investors ("Sharks").',
    '/assets/posters/eda3aef16bf34987be761c6a8f803db2.jpg',
    'TBD',
    'TBD',
    NULL,
    '₹200 PER TEAM',
    20000,
    1, 4, NULL, '1st Prize: ₹2,000 | 2nd Prize: ₹1,000', TRUE, TRUE
),
(
    '36d2551b-da51-4bb0-b1d4-54d3ed7a05e5',
    'CYBER AWARENESS RALLY',
    'NON-TECHNICAL',
    'NON-TECHNICAL',
    NULL,
    '/assets/posters/4f76a83d8e9a4c6bb9ec2a28d3714c17.jpg',
    'TBA',
    '7 — 8 OCTOBER',
    NULL,
    NULL, NULL, NULL, NULL, NULL, NULL, TRUE, TRUE
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    tag = EXCLUDED.tag,
    description = EXCLUDED.description,
    poster_url = EXCLUDED.poster_url,
    venue = EXCLUDED.venue,
    event_date = EXCLUDED.event_date,
    event_time = EXCLUDED.event_time,
    fee = EXCLUDED.fee,
    fee_amount = EXCLUDED.fee_amount,
    min_team_size = EXCLUDED.min_team_size,
    max_team_size = EXCLUDED.max_team_size,
    max_teams = EXCLUDED.max_teams,
    prize = EXCLUDED.prize,
    active = EXCLUDED.active,
    registration_open = EXCLUDED.registration_open,
    updated_at = CURRENT_TIMESTAMP;

COMMIT;
