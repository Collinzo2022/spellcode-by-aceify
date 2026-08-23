export const TRACKS = ["HTML", "CSS", "JavaScript"] as const;
export const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"] as const;

export type TrackName = (typeof TRACKS)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];

export type LessonDefinition = {
  id: string;
  title: string;
  description: string;
  duration: string;
  difficulty: Difficulty;
  order: number;
  xp: number;
  objective: string;
  theory: string;
  example: string;
  challenge: {
    prompt: string;
    required: string[];
    hint: string;
  };
};

export type TrackDefinition = {
  id: string;
  name: TrackName;
  description: string;
  color: string;
  totalLessons: number;
  lessons: LessonDefinition[];
};

export const CURRICULUM: TrackDefinition[] = [
  {
    id: "html",
    name: "HTML",
    description: "Build meaningful structure for every screen on the web.",
    color: "#e7815d",
    totalLessons: 12,
    lessons: [
      {
        id: "html-foundations",
        title: "Your first HTML document",
        description: "Learn the structure that gives every web page a beginning.",
        duration: "12 min",
        difficulty: "Beginner",
        order: 1,
        xp: 50,
        objective: "Create a semantic personal welcome page.",
        theory: "HTML is the structural language of the web. Tags describe the role of content so browsers and assistive technology can understand it.",
        example: "<main>\n  <h1>Hello, web</h1>\n  <p>I am learning HTML.</p>\n</main>",
        challenge: {
          prompt: "Create a main section with a heading and an introductory paragraph.",
          required: ["<main", "<h1", "<p"],
          hint: "Start with a <main> element, then add the heading inside it.",
        },
      },
      {
        id: "html-semantic-layout",
        title: "Structure with purpose",
        description: "Use landmark elements to make layouts clear and accessible.",
        duration: "18 min",
        difficulty: "Beginner",
        order: 2,
        xp: 60,
        objective: "Arrange a page using header, main, article, and footer landmarks.",
        theory: "Semantic elements communicate intent. A page with meaningful landmarks is easier to navigate, maintain, and extend.",
        example: "<header>Notebook</header>\n<main><article><h1>Notes</h1></article></main>\n<footer>Made with care</footer>",
        challenge: {
          prompt: "Add a header, main section, and footer to the page.",
          required: ["<header", "<main", "<footer"],
          hint: "Landmarks should describe the main regions of your document.",
        },
      },
      {
        id: "html-forms",
        title: "Forms people can use",
        description: "Pair labels, inputs, and buttons for friendly forms.",
        duration: "20 min",
        difficulty: "Intermediate",
        order: 3,
        xp: 75,
        objective: "Build an accessible sign-up form.",
        theory: "Good form structure makes each field understandable. Labels connect language to controls and buttons make the next action explicit.",
        example: "<label for=\"email\">Email</label>\n<input id=\"email\" type=\"email\" />\n<button>Join</button>",
        challenge: {
          prompt: "Create an email field with a label and a submit button.",
          required: ["<label", "<input", "<button"],
          hint: "A label's for attribute should match the input id.",
        },
      },
    ],
  },
  {
    id: "css",
    name: "CSS",
    description: "Turn clear structure into expressive, responsive interfaces.",
    color: "#7767d8",
    totalLessons: 14,
    lessons: [
      {
        id: "css-visual-language",
        title: "A visual language",
        description: "Shape hierarchy with type, color, space, and contrast.",
        duration: "16 min",
        difficulty: "Beginner",
        order: 1,
        xp: 50,
        objective: "Create a calm visual treatment for a welcome card.",
        theory: "CSS separates visual decisions from document structure. Start with a small set of intentional rules rather than decorating one property at a time.",
        example: "body { font-family: system-ui; background: #f7f5f2; }\nh1 { color: #27231f; }",
        challenge: {
          prompt: "Set a page background and give the main heading a color.",
          required: ["background", "h1", "color"],
          hint: "Write a selector, then wrap property and value in braces.",
        },
      },
      {
        id: "css-flex-layout",
        title: "Layout with flexbox",
        description: "Align groups of content without fragile positioning.",
        duration: "22 min",
        difficulty: "Intermediate",
        order: 2,
        xp: 75,
        objective: "Lay out a responsive set of feature cards.",
        theory: "Flexbox is a one-dimensional layout system. It helps you control how items grow, shrink, align, and wrap.",
        example: ".features { display: flex; gap: 1rem; flex-wrap: wrap; }\n.feature { flex: 1 1 14rem; }",
        challenge: {
          prompt: "Use flexbox to create a row of cards with a gap.",
          required: ["display: flex", "gap"],
          hint: "Apply display: flex to the parent containing your cards.",
        },
      },
      {
        id: "css-responsive-systems",
        title: "Responsive systems",
        description: "Make layouts adapt deliberately across screen sizes.",
        duration: "24 min",
        difficulty: "Advanced",
        order: 3,
        xp: 100,
        objective: "Add a mobile-first breakpoint to a two-column layout.",
        theory: "Responsive interfaces make room for the same content under different constraints. Begin with the small-screen composition, then enhance when space allows.",
        example: ".grid { display: grid; gap: 1rem; }\n@media (min-width: 768px) { .grid { grid-template-columns: 1fr 1fr; } }",
        challenge: {
          prompt: "Create a media query that applies a two-column layout.",
          required: ["@media", "grid-template-columns"],
          hint: "Use @media (min-width: ...) to hold the wider-screen rule.",
        },
      },
    ],
  },
  {
    id: "javascript",
    name: "JavaScript",
    description: "Create thoughtful interactions with programming fundamentals.",
    color: "#d89b45",
    totalLessons: 16,
    lessons: [
      {
        id: "javascript-variables",
        title: "Values and variables",
        description: "Store information and make your first program readable.",
        duration: "15 min",
        difficulty: "Beginner",
        order: 1,
        xp: 50,
        objective: "Store a learner name and display a tailored message.",
        theory: "Variables give names to values. Clear names make code easier to read today and easier to change tomorrow.",
        example: "const learner = 'Ace';\nconst message = `Welcome, ${learner}!`;\nconsole.log(message);",
        challenge: {
          prompt: "Declare a const variable and use console.log to display it.",
          required: ["const", "console.log"],
          hint: "Use const when the variable will not need a new value.",
        },
      },
      {
        id: "javascript-events",
        title: "Respond to events",
        description: "Connect a user action to a change on the page.",
        duration: "23 min",
        difficulty: "Intermediate",
        order: 2,
        xp: 75,
        objective: "Update an interface after a button is clicked.",
        theory: "Event listeners make web pages interactive. The browser tells your code when an action happens, and your code decides what should follow.",
        example: "button.addEventListener('click', () => {\n  title.textContent = 'Nice work!';\n});",
        challenge: {
          prompt: "Add a click listener to a button.",
          required: ["addEventListener", "click"],
          hint: "Select an element first, then listen for the click event.",
        },
      },
      {
        id: "javascript-dom-state",
        title: "Interface state",
        description: "Build a small interaction that remembers a value.",
        duration: "28 min",
        difficulty: "Advanced",
        order: 3,
        xp: 100,
        objective: "Create a small counter interaction with state.",
        theory: "State is the information an interface needs to remember. Keep it clear, update it intentionally, then reflect it in the DOM.",
        example: "let count = 0;\nbutton.addEventListener('click', () => {\n  count += 1;\n  output.textContent = count;\n});",
        challenge: {
          prompt: "Create a counter that increments when a button is clicked.",
          required: ["let count", "addEventListener", "+="],
          hint: "Begin by declaring a count variable outside the listener.",
        },
      },
    ],
  },
];

export const PROJECTS = [
  {
    id: "landing-page",
    title: "Build a landing page",
    description: "Compose a focused, responsive page that introduces an idea with clarity.",
    track: "HTML" as TrackName,
    difficulty: "Beginner" as Difficulty,
    duration: "1h 20m",
    steps: ["Plan your page sections", "Build semantic HTML", "Create a visual hierarchy", "Refine for mobile"],
  },
  {
    id: "calculator",
    title: "Build a calculator",
    description: "Combine layout, state, and click events into a useful interface.",
    track: "JavaScript" as TrackName,
    difficulty: "Intermediate" as Difficulty,
    duration: "2h 10m",
    steps: ["Model calculator state", "Lay out controls", "Handle number input", "Evaluate expressions"],
  },
] as const;

