export interface Template {
  id: string;
  name: string;
  description: string;
  code: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "flowchart",
    name: "Flowchart",
    description: "Processes, decisions and workflows",
    code: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it 🚀]
    B -- No --> D[Debug]
    D --> E[Fix the bug]
    E --> B
    C --> F((Done))`,
  },
  {
    id: "sequence",
    name: "Sequence",
    description: "Interactions between participants over time",
    code: `sequenceDiagram
    autonumber
    actor User
    participant App
    participant API
    participant DB as Database
    User->>App: Click "Save"
    App->>API: POST /diagrams
    API->>DB: INSERT diagram
    DB-->>API: OK
    API-->>App: 201 Created
    App-->>User: Saved ✓
    Note over App,API: All traffic over HTTPS`,
  },
  {
    id: "class",
    name: "Class",
    description: "Object-oriented structure and relationships",
    code: `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog {
        +String breed
        +fetch() void
    }
    class Cat {
        +bool indoor
        +purr() void
    }
    Animal <|-- Dog
    Animal <|-- Cat
    Dog "1" --> "*" Toy : plays with`,
  },
  {
    id: "state",
    name: "State",
    description: "States and transitions of a system",
    code: `stateDiagram-v2
    [*] --> Draft
    Draft --> Review : submit
    Review --> Draft : request changes
    Review --> Published : approve
    Published --> Archived : archive
    Archived --> [*]`,
  },
  {
    id: "er",
    name: "Entity Relationship",
    description: "Database schemas and relations",
    code: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    CUSTOMER {
        int id PK
        string name
        string email
    }
    ORDER {
        int id PK
        int customer_id FK
        date created_at
    }
    PRODUCT {
        int id PK
        string title
        float price
    }`,
  },
  {
    id: "gantt",
    name: "Gantt",
    description: "Project schedules and timelines",
    code: `gantt
    title Product Launch
    dateFormat YYYY-MM-DD
    section Design
        Research        :done,    des1, 2026-01-05, 7d
        Wireframes      :active,  des2, after des1, 5d
    section Build
        Frontend        :         dev1, after des2, 10d
        Backend         :         dev2, after des2, 12d
    section Release
        QA              :         qa1, after dev2, 4d
        Launch 🎉       :milestone, after qa1, 0d`,
  },
  {
    id: "pie",
    name: "Pie",
    description: "Proportions of a whole",
    code: `pie showData
    title Where the time goes
    "Coding" : 40
    "Meetings" : 25
    "Code review" : 20
    "Coffee" : 15`,
  },
  {
    id: "mindmap",
    name: "Mindmap",
    description: "Hierarchical brainstorming",
    code: `mindmap
  root((Mermade))
    Editing
      Syntax highlighting
      Live preview
      Error hints
    Import
      .mmd files
      Markdown
      Share links
    Export
      SVG
      PNG
      Markdown`,
  },
  {
    id: "timeline",
    name: "Timeline",
    description: "Events in chronological order",
    code: `timeline
    title History of the Web
    1991 : First website
    1995 : JavaScript
         : PHP
    2004 : Web 2.0
    2008 : Chrome
    2015 : ES2015`,
  },
  {
    id: "journey",
    name: "User Journey",
    description: "User experience across steps",
    code: `journey
    title Making a diagram
    section Create
      Open editor: 5: Me
      Pick a template: 4: Me
    section Edit
      Write code: 3: Me
      Preview updates: 5: Me
    section Share
      Export PNG: 5: Me, Team`,
  },
  {
    id: "git",
    name: "Git Graph",
    description: "Branches, commits and merges",
    code: `gitGraph
    commit
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
    commit
    branch hotfix
    commit
    checkout main
    merge hotfix`,
  },
  {
    id: "quadrant",
    name: "Quadrant",
    description: "Two-axis prioritization chart",
    code: `quadrantChart
    title Feature prioritization
    x-axis Low Effort --> High Effort
    y-axis Low Impact --> High Impact
    quadrant-1 Plan carefully
    quadrant-2 Do first
    quadrant-3 Maybe later
    quadrant-4 Avoid
    Dark mode: [0.2, 0.7]
    Share links: [0.3, 0.85]
    Realtime collab: [0.9, 0.8]
    Custom fonts: [0.6, 0.2]`,
  },
  {
    id: "xychart",
    name: "XY Chart",
    description: "Bar and line charts",
    code: `xychart-beta
    title "Monthly signups"
    x-axis [Jan, Feb, Mar, Apr, May, Jun]
    y-axis "Users" 0 --> 1000
    bar [120, 230, 410, 520, 700, 880]
    line [120, 230, 410, 520, 700, 880]`,
  },
  {
    id: "blank",
    name: "Blank",
    description: "Start from an empty canvas",
    code: `flowchart LR
    A --> B`,
  },
];

export const DEFAULT_TEMPLATE = TEMPLATES[0]!;
