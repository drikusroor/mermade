/** Flowcharts exercising syntax the source-level parser must agree with Mermaid on. */
export const CORPUS: Record<string, string> = {
  basic: `flowchart TD
    A[Start] --> B{Is it working?}
    B -- Yes --> C[Ship it 🚀]
    B -- No --> D[Debug]
    D --> E[Fix the bug]
    E --> B
    C --> F((Done))`,
  shapes: `graph LR
  a1(round) --> b1([stadium]) --> c1[[sub]] --> d1[(db)] --> e1((circle))
  f1>odd] --- g1{rhombus} --- h1{{hex}} --- i1[/lean/] --- j1[\\lean2\\]
  k1[/trap\\] -.-> l1[\\inv/] ==> m1(((double)))
  n1@{ shape: cyl, label: "Meta DB" } --> o1
  p1["quoted [brackets] (parens)"] --> q1("with \`markdown\`")`,
  links: `flowchart LR
  A-->B
  A --- C
  A -.-> D
  A ==> E
  A --o F
  A --x G
  A <--> H
  A ~~~ I
  A -->|pipe label| J
  A -- inline text --> K
  A -. dotted text .-> L
  A == thick text ==> M
  A ---->|long| N
  A -->|"quoted | pipe"| O
  A e1@--> P`,
  groups: `flowchart TB
  A & B --> C & D
  C --> E --> F & G
  A --> B --> A
  A --> B`,
  subgraphs: `flowchart LR
  subgraph api [API Layer]
    direction TB
    gw[Gateway] --> auth(Auth)
    subgraph inner[Internal]
      svc1 --> svc2
    end
  end
  subgraph data
    db[(Postgres)]
    cache[(Redis)]
  end
  subgraph My Untitled Group
    x1 --> x2
  end
  auth -->|reads| db
  svc2 --> cache
  gw --> outside
  data --> api`,
  membership: `flowchart TD
  A --> B
  subgraph one
    A
    C --> D
  end
  subgraph two
    B --> C
    E
  end
  subgraph three
    subgraph four
      F --> A
    end
    F
    G
  end`,
  styling: `flowchart LR
  A:::hot --> B
  B --> C
  classDef hot fill:#f96
  class B,C hot
  style A stroke:#333,stroke-width:4px
  linkStyle 0,1 stroke:#ff3
  linkStyle default stroke:#999
  click A "https://example.com" "Tooltip; here"`,
  semicolons: `graph TD;A-->B;B-->C;
  %% a comment
  C-->D;
  %% comment between
  D["semi;colon"]-->E`,
  frontmatter: `---
title: With front matter
config:
  theme: forest
---
%%{init: {"flowchart": {"curve": "basis"}}}%%
flowchart LR
  a --> b`,
  ids: `flowchart LR
  node_1 --> node-2
  node.three --> Ünïcode
  n-1-->n-2
  service-a-->service-b`,
  multiline: `flowchart TD
  A["first line
  second line"] --> B
  B --> C["\`**bold** markdown\`"]`,
  architecture: `flowchart LR
  subgraph edge[Edge]
    cdn[CDN] --> lb[Load Balancer]
  end
  subgraph core[Core services]
    lb --> web[Web App]
    web --> users[User Service]
    web --> orders[Order Service]
    orders --> payments[Payment Service]
    orders --> inventory[Inventory Service]
  end
  subgraph data[Data]
    usersdb[(Users DB)]
    ordersdb[(Orders DB)]
    queue[[Event Bus]]
  end
  users --> usersdb
  orders --> ordersdb
  orders --> queue
  payments --> queue
  inventory --> queue
  queue --> mailer[Mailer]`,
};
