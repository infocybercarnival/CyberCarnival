// Central event registry — single source of truth for event content.
// Structured so it can later be replaced by / hydrated from the Flask backend.
// Poster files live in /public/assets/posters and are mapped by actual
// poster artwork (several uploaded filenames were swapped relative to
// their contents — mapping below follows the artwork, not the filename).

export type Coordinator = {
  name: string
  role: string
  phone?: string
}

export type PrizeItem = {
  rank: string
  amount: string
}

export type EvaluationCriterion = {
  category: string
  marks: string
}

export type EventRound = {
  name: string
  desc: string
}

export type EventInfo = {
  no: string
  name: string
  tag: string
  desc: string
  /** Path under /public. Null = no official poster provided yet. */
  poster: string | null
  posterAlt: string
  /** Optional second poster (e.g. workshops have two partner posters). */
  extraPoster?: string
  extraPosterAlt?: string
  details: {
    date: string
    time: string
    venue: string
    teamSize: string
    fee: string
    prize: string
  }
  duration?: string
  rounds?: string
  expectedRegistrations?: string
  facultyCoordinators?: Coordinator[]
  studentCoordinators?: Coordinator[]
  rules?: string[]
  prerequisites?: string[]
  prizesList?: PrizeItem[]
  evaluationCriteria?: EvaluationCriterion[]
  eventRounds?: EventRound[]
  toolsRequired?: string
  additionalInfo?: string[]
}

// Placeholder used when the poster does not state a value.
// Kept as a constant so backend integration can find and replace these.
const TBA = 'TBA'

export const EVENT_DATES = '7 — 8 OCTOBER'

export const EVENTS: EventInfo[] = [
  {
    no: '01',
    name: 'CAPTURE THE FLAG',
    tag: 'COMPETITION',
    desc: 'Put your cybersecurity skills to the ultimate test in a 6-hour Capture The Flag (CTF) competition featuring hands-on challenges inspired by real-world security scenarios. Participants will identify vulnerabilities, analyze systems, solve security problems, and capture hidden flags across multiple cybersecurity domains.\n\nWith challenges ranging from beginner to advanced difficulty, teams must combine technical knowledge, logical thinking, creativity, and teamwork to climb the live leaderboard and emerge victorious.',
    poster: '/assets/posters/0f2f13717f064841b9ea6c0cea057590.jpg',
    posterAlt: 'Capture The Flag official event poster',
    details: {
      date: EVENT_DATES,
      time: '10:00 AM ONWARDS',
      venue: 'SRM RAMAPURAM',
      teamSize: 'MAX 2 MEMBERS',
      fee: '₹300 PER TEAM',
      prize: '1st Prize: ₹2,000 | 2nd Prize: ₹1,000',
    },
    duration: '6 Hours',
    rounds: '1 Round',
    expectedRegistrations: '30 Teams',
    facultyCoordinators: [
      { name: 'Dr. Paramesh', role: 'AP/CS' },
      { name: 'Mrs. Juslin', role: 'AP/CS' },
    ],
    studentCoordinators: [
      { name: 'Sarvaesh', role: 'III Year CS D' },
      { name: 'Pranav', role: 'II Year CS B' },
    ],
    rules: [
      'Team size: Maximum 2 members.',
      'Competition duration: 6 hours.',
      'Participants may target only the designated CTF environment.',
      'Attacks on college infrastructure, other teams, or external systems are prohibited.',
      'DoS/DDoS attacks are strictly prohibited.',
      'AI tools, AI assistants, and AI-generated solutions are strictly prohibited.',
      'Flags, solutions, exploits, or hints must not be shared between teams.',
      'Authorized cybersecurity tools and non-AI resources may be used unless restricted for a challenge.',
      'Tampering with the leaderboard, scoring system, or CTF infrastructure is prohibited.',
      'Any malpractice or violation of rules will result in immediate disqualification.',
      'In case of a tie, the team achieving the score first will be ranked higher.',
      "Judges' decision will be final.",
    ],
    prizesList: [
      { rank: '1st Prize', amount: '₹2,000' },
      { rank: '2nd Prize', amount: '₹1,000' },
    ],
  },
  {
    no: '02',
    name: 'BUG BOUNTY',
    tag: 'COMPETITION',
    desc: "Get ready for an exciting Bug Bounty where participants solve hands-on security challenges by identifying vulnerabilities and capturing flags. Inspired by challenge-based Capture-the-Flag (CTF) formats, the event features real-world scenarios with varying difficulty levels and a competitive leaderboard to test participants' cybersecurity skills.",
    poster: '/assets/posters/86ca9a454b1445c191da11c1fab7167f.jpg',
    posterAlt: 'Bug Bounty official event poster',
    details: {
      date: EVENT_DATES,
      time: TBA,
      venue: 'SRM RAMAPURAM',
      teamSize: 'MAX 2 MEMBERS',
      fee: '₹200 PER TEAM',
      prize: '1st Prize: ₹2,000 | 2nd Prize: ₹1,000',
    },
    rounds: '1 Round',
    expectedRegistrations: '30 Teams',
    facultyCoordinators: [
      { name: 'Dr. Kavitha', role: 'Professor/CS' },
      { name: 'Dr. Snehapriya', role: 'AP/CS' },
    ],
    studentCoordinators: [
      { name: 'Sanjaidharshan', role: 'III Year CS B' },
      { name: 'Shamhithan', role: 'II Year CS C' },
    ],
    rules: [
      'Team size: Maximum 2 members.',
      'Participants may attack only the event application.',
      'Attacks against college infrastructure, other teams, or the event platform are strictly prohibited.',
      'Do not perform Denial-of-Service (DoS/DDoS) attacks.',
      'No sharing of flags, exploits, or solutions with other teams.',
      'Automated exploitation tools are permitted unless restricted for a specific challenge.',
      "The judges' decision is final.",
      'Any form of malpractice will result in immediate disqualification.',
    ],
    prizesList: [
      { rank: '1st Prize', amount: '₹2,000' },
      { rank: '2nd Prize', amount: '₹1,000' },
    ],
    additionalInfo: [
      'Challenge-based Bug Bounty/CTF competition.',
      'Real-world security scenarios with varying difficulty levels.',
      'Live leaderboard for participant rankings.',
      'Focus on ethical hacking and responsible vulnerability discovery.',
    ],
  },
  {
    no: '03',
    name: 'RED TEAM × BLUE TEAM',
    tag: 'COMPETITION',
    desc: 'Red Team vs Blue Team is a cybersecurity attack-and-defense competition where participants experience the offensive and defensive sides of cybersecurity in a realistic, controlled environment.\n\nTeams are randomly assigned as either Red Team or Blue Team. The Red Team identifies and exploits vulnerabilities in a designated web application to capture flags, while the Blue Team analyzes logs, detects malicious activities, and reconstructs attack scenarios.\n\nSuccess depends on technical skills, teamwork, analytical thinking, and strategic decision-making.\n\nA live leaderboard tracks team performance throughout the event.',
    poster: '/assets/posters/a28952d1003e4077b386f3527e6b20a8.jpg',
    posterAlt: 'Red Team vs Blue Team official event poster',
    details: {
      date: 'TBD',
      time: 'TBD',
      venue: 'TBD',
      teamSize: '2–3 PARTICIPANTS PER TEAM',
      fee: '₹300 PER TEAM',
      prize: '1st Prize: ₹2,000 | 2nd Prize: ₹1,000',
    },
    expectedRegistrations: '20 Teams (60 Expected Participants)',
    facultyCoordinators: [
      { name: 'Mrs. Chitra M', role: 'AP/CS & GT', phone: '+91 99762 33060' },
      { name: 'Mrs. S. Lakshmi', role: 'AP/CS & GT', phone: '+91 99624 85494' },
    ],
    studentCoordinators: [
      { name: 'Dhurgesh MJ', role: 'III Year CSE-CS-B', phone: '+91 94444 73677' },
      { name: 'Chitranjan', role: 'III Year CSE', phone: '+91 93612 13547' },
      { name: 'Mouriya S', role: 'II Year CS-C', phone: '+91 88838 26106' },
    ],
    rules: [
      'Attack only the designated event domains.',
      'No external targets or internet scanning.',
      'No DDoS or brute-force attacks.',
      'No automated exploitation frameworks.',
      'Flags must be submitted only through the official event portal.',
      'No flag sharing between teams.',
      'Team discussion is allowed only within the assigned team.',
      'Any unethical behavior will result in immediate disqualification.',
      'Organizers’ decision will be final.',
    ],
    prerequisites: [
      'Basic understanding of computers and web applications.',
      'Interest in cybersecurity and ethical hacking.',
      'Laptop (one per participant or team) is mandatory.',
    ],
    prizesList: [
      { rank: '🥇 First Prize', amount: '₹2,000' },
      { rank: '🥈 Second Prize', amount: '₹1,000' },
    ],
    additionalInfo: [
      'Teams will be randomly assigned to either the Red Team or Blue Team at the start of the event.',
      'All activities will be conducted in a secure, isolated lab environment.',
      'A live leaderboard will display scores throughout the event.',
    ],
  },
  {
    no: '04',
    name: 'PAPER PRESENTATION',
    tag: 'RESEARCH',
    desc: 'Showcase your research, innovative ideas, and technical expertise through an engaging Paper Presentation competition. Participants are invited to present original concepts, research findings, emerging technologies, case studies, or problem-solving approaches across various domains of Computer Science and related fields.\n\nThe event provides a platform to demonstrate analytical thinking, technical knowledge, communication skills, and creativity while presenting ideas before a panel of judges. Teams will be evaluated based on the quality of their research, presentation skills, innovation, and ability to respond to technical questions.',
    poster: '/assets/posters/aa55ba4e2d454774a1b225461491b9b5.jpg',
    posterAlt: 'Paper Presentation official event poster',
    details: {
      date: EVENT_DATES,
      time: '09:00 AM ONWARDS',
      venue: 'SRM RAMAPURAM',
      teamSize: 'MAX 3 MEMBERS',
      fee: '₹150 PER TEAM',
      prize: '1st Prize: ₹2,000 | 2nd Prize: ₹1,000',
    },
    duration: '7 Minutes Presentation + 3 Minutes Q&A',
    rounds: '1 Round',
    expectedRegistrations: '30 Teams (First Come, First Served)',
    facultyCoordinators: [
      { name: 'Dr. BHUVANESHWARI', role: 'AP/CS' },
      { name: 'Dr. RAMYA', role: 'AP/CS' },
    ],
    studentCoordinators: [
      { name: 'Manjith Akash U S', role: 'III Year CS D' },
      { name: 'Advait Bansod', role: 'II Year CS A' },
    ],
    rules: [
      'Team size: Maximum 3 members.',
      'Registration fee: ₹150 per team.',
      'Maximum registrations: 30 teams (First Come, First Served).',
      'Participants may present research papers, innovative concepts, case studies, or technical solutions relevant to the theme of technology and computing.',
      'The submitted work must be original and free from plagiarism.',
      'Participants must submit their paper and presentation before the specified deadline.',
      'Each team will be allotted 7 minutes for presentation and 3 minutes for the Question & Answer session.',
      'All presentations must be prepared using PowerPoint or equivalent presentation software.',
      'Professional conduct must be maintained throughout the event.',
      'Any form of plagiarism, misrepresentation, or misconduct will result in immediate disqualification.',
      'The decision of the judges shall be final and binding.',
      'In case of a tie, preference will be given based on technical content, innovation, and performance during the Q&A session.',
    ],
    prizesList: [
      { rank: '1st Prize', amount: '₹2,000' },
      { rank: '2nd Prize', amount: '₹1,000' },
    ],
    evaluationCriteria: [
      { category: 'Technical Content & Research Quality', marks: '30 Marks' },
      { category: 'Innovation & Creativity', marks: '20 Marks' },
      { category: 'Presentation Skills', marks: '20 Marks' },
      { category: 'Paper Structure & Documentation', marks: '10 Marks' },
      { category: 'Question & Answer Performance', marks: '20 Marks' },
    ],
  },
  {
    no: '05',
    name: 'CYBER CONCLAVE 26',
    tag: 'PANEL',
    desc: 'Where industry meets innovation. Cyber Conclave brings top cybersecurity experts, ethical hackers, and tech leaders together for powerful panel discussions on the future of digital security.\n\nFrom AI-driven threats to building resilient digital infrastructure — get real insights from professionals shaping the next decade of cybersecurity.',
    poster: '/assets/posters/84e4291b11274a518b179c48100d0ab7.jpg',
    posterAlt: 'Cyber Conclave 26 official event poster',
    details: {
      date: '7th of October',
      time: 'After the inauguration',
      venue: 'Geetham Auditorium',
      teamSize: 'INDIVIDUAL',
      fee: '₹200',
      prize: 'N/A',
    },
    expectedRegistrations: '100',
    facultyCoordinators: [
      { name: 'Dr. S. Sathya Priya', role: 'AP/CS', phone: '+91 9444175724' },
      { name: 'Mrs. Chitra M', role: 'AP/CS & GT', phone: '+91 9976233060' },
    ],
    studentCoordinators: [
      { name: 'Felicia Ebinezer', role: 'III Year CSE - CS - B', phone: '+91 7010770378' },
      { name: 'Sarah Alana Robson', role: 'III Year CSE - CS - C', phone: '+91 73056 80870' },
      { name: 'Sai Saran.B', role: 'III Year CSE - CS - C', phone: '+91 8248943843' },
    ],
  },
  {
    no: '06',
    name: 'TOOL EXPO',
    tag: 'EXHIBITION',
    desc: 'Tools Expo is a platform for students to showcase innovative cybersecurity tools and solutions developed by them. Participants can bring their own tools, explain the problem they aim to solve, and demonstrate how their solution works.\n\nThe event focuses on encouraging students to transform their cybersecurity knowledge into practical solutions. Through live demonstrations and interaction with the judging panel, participants get an opportunity to showcase their creativity, technical skills, and understanding of real-world security requirements.',
    poster: '/assets/posters/436ff427c63941328c46c3e8e8e7b95c.jpg',
    posterAlt: 'Tools Expo official event poster',
    details: {
      date: EVENT_DATES,
      time: '09:00 AM ONWARDS',
      venue: 'SRM RAMAPURAM',
      teamSize: 'MAX 3 MEMBERS',
      fee: '₹200 PER TEAM',
      prize: '1st Prize: ₹2,000 | 2nd Prize: ₹1,000',
    },
    rounds: 'Single Round – Showcase & Evaluation',
    expectedRegistrations: '30 Teams',
    facultyCoordinators: [
      { name: 'Ms. Sowmiya Sree', role: 'Faculty Coordinator' },
      { name: 'Dr. Sathyapriya', role: 'Faculty Coordinator' },
    ],
    studentCoordinators: [
      { name: 'Sriman', role: 'III Year CS D' },
      { name: 'Hemanth', role: 'II Year CS C' },
    ],
    rules: [
      'Each team can have a maximum of 3 members.',
      'Each team must bring one cybersecurity-related tool, utility, or solution developed or significantly customized by them.',
      'Participants must be able to explain the purpose, working, key features, and practical applications of their tool.',
      'Teams are responsible for bringing all necessary files, software, dependencies, and setup requirements needed for the demonstration.',
      'The tool must be functional and ready for demonstration during the event.',
      'Judges may interact with, question, and conduct controlled testing of the demonstrated tool as part of the evaluation.',
      'Any testing involving potentially vulnerable systems must be performed only in an authorized or controlled environment.',
      'Participants must not target or interfere with college infrastructure, other participants, networks, websites, or unauthorized systems.',
      'Tools must not intentionally cause data loss, system damage, service disruption, or any other harmful effects.',
      'Teams must disclose the use of any existing open-source projects, frameworks, or publicly available technologies incorporated into their tool.',
      'Plagiarism, copied projects, or falsely presenting another person\'s work as the team\'s own may result in disqualification.',
      'Participants must follow the instructions provided by the event coordinators and judging panel during the demonstration.',
      'Teams will be evaluated based on innovation, originality, technical implementation, functionality, practical usefulness, and quality of demonstration.',
      'The judges\' decision will be final and binding.',
      'Any form of malpractice, misconduct, or violation of the event rules may result in immediate disqualification.',
    ],
    prizesList: [
      { rank: '1st Prize', amount: '₹2,000' },
      { rank: '2nd Prize', amount: '₹1,000' },
    ],
    additionalInfo: [
      'Tools Expo is an exhibition-style cybersecurity competition focused on student-built tools, where participants are encouraged to bring innovative and practical security solutions.',
      'The tools can focus on areas such as vulnerability assessment, network security, automation, digital forensics, threat detection, or defensive security.',
      'Participants get the opportunity to demonstrate their creations directly to a judging panel and showcase their technical abilities through a live demonstration.',
      'The event places emphasis on innovation, originality, technical implementation, functionality, and real-world applicability, encouraging students to move beyond theoretical cybersecurity concepts and develop practical solutions to address real-world security challenges.',
    ],
  },
  {
    no: '07',
    name: 'WORKSHOPS',
    tag: 'HANDS-ON',
    desc: 'Guided deep-dives with Supraja Technologies and Algorand. Bring a laptop, leave with a skillset.',
    poster: '/assets/posters/59aa5974fea3439798728cbbedbf5257.jpg',
    posterAlt: 'Supraja Technologies workshop official poster',
    extraPoster: '/assets/posters/4b5ea92f89724932ab0c9759680cd482.jpg',
    extraPosterAlt: 'Algorand workshop official poster',
    details: {
      date: '7 OCTOBER',
      time: '10:00 — 1:00',
      venue: 'SRM RAMAPURAM',
      teamSize: TBA,
      fee: TBA,
      prize: TBA,
    },
  },
  {
    no: '08',
    name: 'SHARK TANK',
    tag: 'NON-TECHNICAL',
    desc: 'Shark Tank is an entrepreneurship-based competition where participants pitch innovative startup ideas before a panel of judges acting as investors ("Sharks"). Teams must present a real-world problem, propose an innovative solution, explain their business model, and convince the judges of the idea\'s market potential.\n\nThe event promotes innovation, business strategy, creativity, and presentation skills.',
    poster: '/assets/posters/eda3aef16bf34987be761c6a8f803db2.jpg',
    posterAlt: 'Shark Tank official event poster',
    details: {
      date: 'TBD',
      time: 'TBD',
      venue: 'TBD',
      teamSize: '1 — 4 MEMBERS',
      fee: '₹200 PER TEAM',
      prize: '1st Prize: ₹2,000 | 2nd Prize: ₹1,000',
    },
    expectedRegistrations: '50 teams (100–120 members)',
    facultyCoordinators: [
      { name: 'Dr. Gowri mam', role: 'Faculty Coordinator', phone: '9600094032' },
      { name: 'Dr. Ramya mam', role: 'Faculty Coordinator', phone: '+91 99440 26001' },
    ],
    studentCoordinators: [
      { name: 'Rithika K', role: '3rd Yr CSE - CS-B', phone: '9150153198' },
      { name: 'Goutham', role: '3rd Yr CSE - CS-B', phone: '9150120431' },
    ],
    rules: [
      'Team size: 1–4 members.',
      'Each team can present only one original startup idea.',
      'Plagiarism or copied business ideas will result in disqualification.',
      'Presentation must be within the allotted time.',
      'PPT/PDF presentations are allowed.',
      'Teams must answer judges\' questions confidently during the Q&A session.',
      'Professional conduct must be maintained throughout the event.',
      'Judges\' decision will be final and binding.',
      'Organizers reserve the right to modify the rules if required.',
    ],
    eventRounds: [
      {
        name: 'ROUND 1 – IDEA SCREENING',
        desc: '1. Each team will be given 3–5 minutes to present their startup idea.\n2. The pitch should include the problem statement, proposed solution, target audience, and unique value proposition.\n3. Judges will evaluate the idea based on innovation, feasibility, and presentation skills.\n4. The top-performing teams will be shortlisted for the final round.',
      },
      {
        name: 'ROUND 2 – SHARK TANK PITCH (FINAL ROUND)',
        desc: '1. Shortlisted teams will deliver a 5–7 minute detailed business pitch followed by a 3–5 minute Q&A session with the judges.\n2. The presentation should cover the business model, market analysis, revenue model, marketing strategy, financial projections, and future scope.\n3. Judges will evaluate the startup based on business viability, scalability, creativity, communication, and the team\'s ability to answer questions.\n4. Winners will be selected based on the overall performance in the final round.',
      },
    ],
    prerequisites: [
      'Basic understanding of entrepreneurship and business concepts.',
      'Original startup idea.',
      'Presentation (PPT/PDF) prepared in advance.',
    ],
    toolsRequired: '1. Microsoft PowerPoint / Google Slides / Canva (for presentations)\n2. Laptop (recommended)',
    prizesList: [
      { rank: '1st Prize', amount: '₹2,000' },
      { rank: '2nd Prize', amount: '₹1,000' },
      { rank: 'Certificates', amount: 'For Winners and Participants' },
    ],
    additionalInfo: [
      'Participants are encouraged to present innovative solutions to real-world problems.',
      'Business ideas may belong to any domain: Technology, Healthcare, Education, Environment, Finance, Social Impact, etc.',
      'Teams should arrive at the venue at least 15 minutes before their scheduled presentation.',
    ],
  },
  {
    no: '09',
    name: 'SHIPWRECK',
    tag: 'NON-TECHNICAL',
    desc: 'Participants are assigned different characters with specific backgrounds, roles, or abilities and placed in a simulated shipwreck scenario with limited survival resources.\n\nEach participant must present a case explaining why their character should be chosen for survival, while also challenging and responding to the arguments of other participants.\n\nThe discussion progresses through multiple rounds, with participants required to adapt to new situations or constraints introduced by the coordinators.\n\nThe event evaluates communication, logical reasoning, persuasion, creativity, spontaneity, and decision-making under pressure.',
    poster: '/assets/posters/16e50a56c2e141d79b9a33a33a6f8b46.jpg',
    posterAlt: 'Shipwreck official event poster',
    details: {
      date: 'TBD',
      time: 'TBD',
      venue: 'TBD',
      teamSize: '1 MEMBER (SOLO)',
      fee: '₹150 PER PARTICIPANT',
      prize: '1st Place: ₹1,000 | 2nd Place: ₹500',
    },
    expectedRegistrations: '50',
    facultyCoordinators: [
      { name: 'Dr. ILAMATHI', role: 'AP/CS' },
      { name: 'DR. BHUVANESWARI', role: 'AP/CS' },
    ],
    studentCoordinators: [
      { name: 'Sujith Raja R', role: 'III Yr CS A' },
      { name: 'Tharunkrishna S', role: 'III Yr CS A' },
    ],
    rules: [
      'Participants will be assigned a specific character/persona and must portray it throughout the event.',
      'Participants must justify why their character deserves to survive and defend their position against others.',
      'Participants must follow the instructions and time limits given by the coordinators.',
      'Participants may question and counter others but must maintain respectful conduct.',
      'Obscene, abusive, vulgar, or offensive language is strictly prohibited.',
      'Personal attacks, discrimination, cheating, or deliberate disruption will result in disqualification.',
      'Judging will be based on reasoning, communication, persuasion, creativity, spontaneity, and character portrayal.',
      'The decision of the judges will be final.',
    ],
    eventRounds: [
      { name: '01 — CHARACTER INTRODUCTION', desc: 'Participants are assigned a character and given time to understand their role. Each participant introduces their character and explains their background, abilities, and initial reason for deserving survival.' },
      { name: '02 — SURVIVAL DEBATE', desc: 'Participants defend their characters through arguments and discussions. They may question and counter other participants while explaining why their character is more valuable or deserving of survival. Participants may be eliminated based on their performance.' },
      { name: '03 — FINAL SURVIVAL CHALLENGE', desc: 'The remaining participants are presented with new situations, constraints, or challenges by the coordinators. They must adapt their arguments, respond spontaneously, and make a final case for their character\'s survival. The judges evaluate the participants\' overall performance and select the winner(s).' },
    ],
    prerequisites: ['Nil'],
    toolsRequired: 'Nil',
    prizesList: [
      { rank: '1st Place', amount: '₹1,000' },
      { rank: '2nd Place', amount: '₹500' },
    ],
    additionalInfo: ['Nil'],
  },
  {
    no: '10',
    name: 'BEHIND THE CRIME',
    tag: 'NON-TECHNICAL',
    desc: 'Behind the Crime is a non-technical, mystery-based event that challenges participants to analyze clues, connect evidence, identify suspects, and uncover the hidden story behind a crime.\n\nThe event focuses on logical thinking, observation, teamwork, and problem-solving skills in an engaging and competitive format.',
    poster: '/assets/posters/18cca6d719534fb99dff76ab2b2bc3f0.jpg',
    posterAlt: 'Behind The Crime official event poster',
    details: {
      date: 'TBD',
      time: 'TBD',
      venue: 'TBD',
      teamSize: '3 — 4 MEMBERS',
      fee: '₹200 PER TEAM',
      prize: '1st Prize: ₹1,500 | 2nd Prize: ₹750',
    },
    expectedRegistrations: '25 Teams',
    facultyCoordinators: [
      { name: 'Dr. KAVITHA', role: 'Professor / CS' },
      { name: 'Dr. SNEHAPRIYA', role: 'AP / CS' },
    ],
    studentCoordinators: [
      { name: 'Paavesh', role: '3rd Year CS' },
      { name: 'Visweswara Rao', role: '3rd Year CS' },
    ],
    rules: [
      'Each team must consist of 3 – 4 members.',
      'Participants must follow the instructions provided by the event coordinators.',
      'Teams must work together and submit their answers within the given time limit.',
      'Any form of unfair means or misconduct will result in disqualification.',
      'Decisions made by the event coordinators/judges will be final.',
      'Participants are expected to maintain discipline and decorum throughout the event.',
    ],
    eventRounds: [
      { name: 'Round 1 – Crime Scene Investigation', desc: 'Participants analyze the given clues and information.' },
      { name: 'Round 2 – Evidence & Deduction', desc: 'Teams connect the evidence and identify important leads.' },
      { name: 'Round 3 – Crack the Case', desc: 'Teams solve the complete mystery and present their conclusion.' },
    ],
    prerequisites: [
      'No technical knowledge required.',
      'Logical thinking and observation skills are recommended.',
      'Teamwork and active participation are encouraged.',
    ],
    toolsRequired: 'None',
    prizesList: [
      { rank: '1st Prize', amount: '₹1,500' },
      { rank: '2nd Prize', amount: '₹750' },
    ],
    additionalInfo: [
      'The event is designed as an engaging mystery-solving experience where participants will have to think critically, analyze clues, and work as a team to uncover the truth behind the crime.',
    ],
  },
  {
    no: '11',
    name: 'CYBER AWARENESS RALLY',
    tag: 'NON-TECHNICAL',
    desc: 'A campus-wide rally spreading cyber hygiene and awareness — everyone marches, everyone learns.',
    poster: '/assets/posters/4f76a83d8e9a4c6bb9ec2a28d3714c17.jpg',
    posterAlt: 'Cyber Awareness Rally official event poster',
    details: {
      date: EVENT_DATES,
      time: TBA,
      venue: TBA,
      teamSize: TBA,
      fee: TBA,
      prize: TBA,
    },
  },
  {
    no: '12',
    name: 'FREE FIRE',
    tag: 'NON-TECHNICAL',
    desc: 'Squad-based Free Fire showdown — bring your team, last squad standing wins.',
    poster: '/assets/posters/freefire-placeholder.png',
    posterAlt: 'Free Fire tournament placeholder poster',
    details: {
      date: EVENT_DATES,
      time: TBA,
      venue: 'SRM RAMAPURAM',
      teamSize: '4 MEMBERS',
      fee: TBA,
      prize: TBA,
    },
  },
]


// Static fallback lookup used when the Flask API is temporarily unavailable.
// Accepts the numeric event number, the event name, or a URL-style slug.
export function getEventBySlug(value: string): EventInfo | undefined {
  const normalize = (input: string) =>
    input
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const wanted = normalize(value)
  return EVENTS.find((event) =>
    event.no === value ||
    normalize(event.no) === wanted ||
    normalize(event.name) === wanted
  )
}
