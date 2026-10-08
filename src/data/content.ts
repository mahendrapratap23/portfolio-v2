// content.ts — single source of truth for all copy on the page.
// Edit this file to update any text without touching HTML or TS logic.

export const PERSON = {
  name: "Mahendra Pratap",
  role: "CS and AI Builder",
  email: "mp498343@gmail.com",
  emailDisplay: "hey at mp four eight three dot com",
  github: "https://github.com/mahendrapratap23",
  githubDisplay: "github",
  linkedin: "https://www.linkedin.com/in/mahendra-pratap",
  linkedinDisplay: "linkedin",
};

export const META = {
  title: "Mahendra Pratap, CS and AI Builder",
  description:
    "Portfolio of Mahendra Pratap, CS and AI undergraduate building autonomous agents, local-first systems, and full-stack products.",
};

export const HERO = {
  headline: ["hello, i build", "things that think."],
  hint: "push the letters. draw on the page. wait, something is alive.",
};

export const ABOUT = {
  heading: "about me",
  // Word marked with <s> is the struck-through one — chosen meaningfully
  // (signals growth mindset, echoes template's use of <s>perfect</s>)
  paragraphParts: [
    "I build things that think and things that feel. ",
    "I am a Computer Science undergraduate obsessed with AI agents, ",
    "local-first systems, and making software that surprises people. ",
    "I have shipped autonomous agents, travel planners, and habit dashboards. ",
    "I am not a ",
    { strike: "finished" },
    " thing either. Mark the words you like.",
  ] as Array<string | { strike: string }>,
};

export const SKILLS = {
  heading: "things i do",
  words:
    "Python, TypeScript, React, Next.js, AI agents, LLM orchestration, local-first systems, full-stack engineering, open source.",
  faceAside: "oh, you are an engineer? me too.",
};

export const WORK = {
  heading: "work",
  experience: [
    {
      title: "Industrial Technical Visit",
      org: "Enterprise IT and Software Infrastructure",
      location: "Gujarat, India",
      detail:
        "Production architecture, DevOps and pipelines. Observed enterprise server infrastructure and commercial software workflows.",
    },
  ],
  education: [
    {
      title: "Marwadi University",
      detail:
        "B.Tech in Computer Science and Engineering, AI and ML · two thousand twenty four to two thousand twenty eight · CGPA eight point four two",
    },
    {
      title: "Class twelve",
      detail: "UP Board, Science and Mathematics · eighty-eight percent",
    },
    {
      title: "Class ten",
      detail: "UP Board · eighty-nine percent",
    },
  ],
  certifications: [
    "Oracle Cloud Infrastructure AI Foundations",
    "Cisco CCNA Cloud Networking",
    "IBM Artificial Intelligence Fundamentals",
    "Problem Solving Using Computational Thinking, University of Michigan",
    "Data Analyst and Generative AI Credentials, LinkedIn Learning",
    "Digital Electronics and Hardware Foundations, NPTEL",
  ],
};

export const HELLO = {
  heading: "say hello",
  invite: "Write to me. Leave a blot on this page and I will find it.",
};
