"""
One-time seed: populates the events table with the same events shown on the
frontend (frontend/lib/events-data.ts), so the registration API and admin
panel have real event_ids to work with from day one.

Safe to re-run: skips any event whose name already exists.
Run: python seed_events.py
"""
from app import app
from services.event_service import list_events, create_event, update_event

EVENTS = [
    {
        "name": "CAPTURE THE FLAG",
        "category": "TECHNICAL",
        "tag": "COMPETITION",
        "poster_url": "/assets/posters/0f2f13717f064841b9ea6c0cea057590.jpg",
        "description": "Put your cybersecurity skills to the ultimate test in a 6-hour Capture The Flag (CTF) competition featuring hands-on challenges inspired by real-world security scenarios. Participants will identify vulnerabilities, analyze systems, solve security problems, and capture hidden flags across multiple cybersecurity domains.\n\nWith challenges ranging from beginner to advanced difficulty, teams must combine technical knowledge, logical thinking, creativity, and teamwork to climb the live leaderboard and emerge victorious.",
        "fee": "₹300 PER TEAM",
        "min_team_size": 1,
        "max_team_size": 2,
        "venue": "SRM RAMAPURAM",
        "date": "7 — 8 OCTOBER",
        "prize": "1st Prize: ₹2,000 | 2nd Prize: ₹1,000",
    },
    {
        "name": "BUG BOUNTY",
        "category": "TECHNICAL",
        "tag": "COMPETITION",
        "poster_url": "/assets/posters/86ca9a454b1445c191da11c1fab7167f.jpg",
        "description": "Get ready for an exciting Bug Bounty where participants solve hands-on security challenges by identifying vulnerabilities and capturing flags. Inspired by challenge-based Capture-the-Flag (CTF) formats, the event features real-world scenarios with varying difficulty levels and a competitive leaderboard to test participants' cybersecurity skills.",
        "fee": "₹200 PER TEAM",
        "min_team_size": 1,
        "max_team_size": 2,
        "venue": "SRM RAMAPURAM",
        "date": "7 — 8 OCTOBER",
        "prize": "1st Prize: ₹2,000 | 2nd Prize: ₹1,000",
    },
    {
        "name": "RED TEAM × BLUE TEAM",
        "category": "TECHNICAL",
        "tag": "COMPETITION",
        "poster_url": "/assets/posters/a28952d1003e4077b386f3527e6b20a8.jpg",
        "description": "Red Team vs Blue Team is a cybersecurity attack-and-defense competition where participants experience the offensive and defensive sides of cybersecurity in a realistic, controlled environment.",
        "fee": "₹300 PER TEAM",
        "min_team_size": 2,
        "max_team_size": 3,
        "venue": "TBD",
        "date": "TBD",
        "prize": "1st Prize: ₹2,000 | 2nd Prize: ₹1,000",
    },
    {
        "name": "PAPER PRESENTATION",
        "category": "TECHNICAL",
        "tag": "RESEARCH",
        "poster_url": "/assets/posters/aa55ba4e2d454774a1b225461491b9b5.jpg",
        "description": "Showcase your research, innovative ideas, and technical expertise through an engaging Paper Presentation competition. Participants are invited to present original concepts, research findings, emerging technologies, case studies, or problem-solving approaches across various domains of Computer Science and related fields.\n\nThe event provides a platform to demonstrate analytical thinking, technical knowledge, communication skills, and creativity while presenting ideas before a panel of judges. Teams will be evaluated based on the quality of their research, presentation skills, innovation, and ability to respond to technical questions.",
        "fee": "₹150 PER TEAM",
        "min_team_size": 1,
        "max_team_size": 3,
        "venue": "SRM RAMAPURAM",
        "date": "7 — 8 OCTOBER",
        "prize": "1st Prize: ₹2,000 | 2nd Prize: ₹1,000",
    },
    {
        "name": "CYBER CONCLAVE 26",
        "category": "NON-TECHNICAL",
        "tag": "PANEL",
        "poster_url": "/assets/posters/84e4291b11274a518b179c48100d0ab7.jpg",
        "description": "Where industry meets innovation. Cyber Conclave brings top cybersecurity experts, ethical hackers, and tech leaders together for powerful panel discussions on the future of digital security.\n\nFrom AI-driven threats to building resilient digital infrastructure — get real insights from professionals shaping the next decade of cybersecurity.",
        "fee": "₹200",
        "min_team_size": 1,
        "max_team_size": 1,
        "venue": "Geetham Auditorium",
        "date": "7th of October",
        "time": "After the inauguration",
        "prize": "N/A",
    },
    {
        "name": "TOOL EXPO",
        "category": "TECHNICAL",
        "tag": "EXHIBITION",
        "poster_url": "/assets/posters/436ff427c63941328c46c3e8e8e7b95c.jpg",
        "description": "Tools Expo is a platform for students to showcase innovative cybersecurity tools and solutions developed by them. Participants can bring their own tools, explain the problem they aim to solve, and demonstrate how their solution works.\n\nThe event focuses on encouraging students to transform their cybersecurity knowledge into practical solutions. Through live demonstrations and interaction with the judging panel, participants get an opportunity to showcase their creativity, technical skills, and understanding of real-world security requirements.",
        "fee": "₹200 PER TEAM",
        "min_team_size": 1,
        "max_team_size": 3,
        "venue": "SRM RAMAPURAM",
        "date": "7 — 8 OCTOBER",
        "prize": "1st Prize: ₹2,000 | 2nd Prize: ₹1,000",
    },
    {
        "name": "WORKSHOPS",
        "category": "TECHNICAL",
        "tag": "HANDS-ON",
        "poster_url": "/assets/posters/59aa5974fea3439798728cbbedbf5257.jpg",
        "venue": "SRM RAMAPURAM",
        "date": "7 OCTOBER",
        "time": "10:00 — 1:00",
    },
    {
        "name": "SHARK TANK",
        "category": "NON-TECHNICAL",
        "tag": "NON-TECHNICAL",
        "poster_url": "/assets/posters/eda3aef16bf34987be761c6a8f803db2.jpg",
        "description": "Shark Tank is an entrepreneurship-based competition where participants pitch innovative startup ideas before a panel of judges acting as investors (\"Sharks\"). Teams must present a real-world problem, propose an innovative solution, explain their business model, and convince the judges of the idea's market potential.\n\nThe event promotes innovation, business strategy, creativity, and presentation skills.",
        "fee": "₹200 PER TEAM",
        "min_team_size": 1,
        "max_team_size": 4,
        "venue": "TBD",
        "date": "TBD",
        "prize": "1st Prize: ₹2,000 | 2nd Prize: ₹1,000",
    },
    {
        "name": "SHIPWRECK",
        "category": "NON-TECHNICAL",
        "tag": "NON-TECHNICAL",
        "poster_url": "/assets/posters/16e50a56c2e141d79b9a33a33a6f8b46.jpg",
        "description": "Participants are assigned different characters with specific backgrounds, roles, or abilities and placed in a simulated shipwreck scenario with limited survival resources.\n\nEach participant must present a case explaining why their character should be chosen for survival, while also challenging and responding to the arguments of other participants.\n\nThe discussion progresses through multiple rounds, with participants required to adapt to new situations or constraints introduced by the coordinators.\n\nThe event evaluates communication, logical reasoning, persuasion, creativity, spontaneity, and decision-making under pressure.",
        "fee": "₹150 PER PARTICIPANT",
        "min_team_size": 1,
        "max_team_size": 1,
        "venue": "TBD",
        "date": "TBD",
        "prize": "1st Place: ₹1,000 | 2nd Place: ₹500",
    },
    {
        "name": "BEHIND THE CRIME",
        "category": "NON-TECHNICAL",
        "tag": "NON-TECHNICAL",
        "poster_url": "/assets/posters/18cca6d719534fb99dff76ab2b2bc3f0.jpg",
        "description": "Behind the Crime is a non-technical, mystery-based event that challenges participants to analyze clues, connect evidence, identify suspects, and uncover the hidden story behind a crime.\n\nThe event focuses on logical thinking, observation, teamwork, and problem-solving skills in an engaging and competitive format.",
        "fee": "₹200 PER TEAM",
        "min_team_size": 3,
        "max_team_size": 4,
        "venue": "TBD",
        "date": "TBD",
        "prize": "1st Prize: ₹1,500 | 2nd Prize: ₹750",
    },
    {
        "name": "CYBER AWARENESS RALLY",
        "category": "NON-TECHNICAL",
        "tag": "NON-TECHNICAL",
        "poster_url": "/assets/posters/4f76a83d8e9a4c6bb9ec2a28d3714c17.jpg",
        "venue": "TBA",
        "date": "7 — 8 OCTOBER",
    },
]

if __name__ == "__main__":
    with app.app_context():
        existing_by_name = {e.name: e for e in list_events(include_inactive=True)}
        created = 0
        updated = 0
        for e in EVENTS:
            existing_key = None
            if e["name"] in existing_by_name:
                existing_key = e["name"]
            elif e["name"] == "CYBER CONCLAVE 26" and "CYBER CONCLAVE" in existing_by_name:
                existing_key = "CYBER CONCLAVE"

            if existing_key:
                event_obj = existing_by_name[existing_key]
                update_event(event_obj.id, e)
                updated += 1
                continue
            create_event(e)
            created += 1
        total = len(list_events(include_inactive=True))
        print(f"Seeded {created} new, updated {updated} existing event(s). {total} total in the events table.")
