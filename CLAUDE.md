# Prompt Crit - Claude Development Guide

## Overview

Prompt Crit is a peer critique platform for creative projects built for Wharton Gen AI Studio. It facilitates structured feedback cycles where students reflect on their creative work through AI-guided conversations, provide constructive feedback to peers, and receive feedback on their own projects.

## User Flow Diagram

```mermaid
flowchart LR
    A["Visit App"] --> B["Sign In / Sign Up"]
    B --> C{"Select Role"}

    C -->|"Organizer"| D["Organizer Dashboard"]
    D --> E["Create New Session"]
    E --> F["Manage Student Roster"]
    F --> G["Start Crit Session"]
    G --> H["Monitor Progress"]
    H --> I["View Completion Metrics"]

    C -->|"Student"| J["Student Dashboard"]
    J --> K["Select Active Session"]
    K --> L["AI-Guided Reflection"]
    L --> M["Answer 5 Core Questions"]
    M --> N["Upload 3 Screenshots"]
    N --> O["Write Project Summary"]
    O --> P["Complete Reflection"]
    P --> Q["View Peer Projects"]
    Q --> R["Provide Feedback"]
    R --> S{"More Peers?"}
    S -->|"Yes"| Q
    S -->|"No"| T["View My Feedback"]
    T --> U["Session Complete"]

    G -.->|"Enables"| K
    I -.->|"Tracks"| P
    I -.->|"Tracks"| T
```

## Session Phases

| Phase | Status | Who Sees | Actions Available |
|-------|--------|----------|-------------------|
| Setup | `setup` | Organizer only | Manage Roster, Start Crit |
| Reflection | `reflection` | Students | Complete AI Reflection |
| Critique | `critique` | Students | Provide Peer Feedback |
| Complete | `complete` | Both | View Results/Archive |

## Key User Journeys

### Organizer Journey
1. Login → Dashboard → Create Session → Add Students → Start Crit → Monitor Progress

### Student Journey
1. Login → Dashboard → Select Session
2. **Reflection Phase**: AI asks 5 questions → Upload screenshots → Write summary
3. **Critique Phase**: View peer projects → Provide feedback (loop for each peer)
4. **Review Phase**: Read feedback received → Reflect on suggestions

## AI Reflection Questions

The AI guides students through 5 core questions:
1. What did you build and what motivated you?
2. What emotions do you hope people feel?
3. What insights did you gather?
4. What did you learn about subject/self?
5. What questions remain? What would you explore next?

## Codebase Architecture

```mermaid
flowchart TB
    subgraph Frontend["Frontend (React + Vite)"]
        direction TB
        Main["main.tsx"] --> App["App.tsx"]
        App --> Auth["auth-page.tsx"]
        App --> OrgDash["organizer-dashboard.tsx"]
        App --> StudDash["student-dashboard.tsx"]
        StudDash --> AIRef["ai-reflection.tsx"]
        StudDash --> PeerCrit["peer-critique.tsx"]
        StudDash --> FeedView["feedback-view.tsx"]
    end

    subgraph UI["UI Components"]
        direction LR
        Button["button.tsx"]
        Input["input.tsx"]
        Card["card.tsx"]
        Dialog["dialog.tsx"]
        Textarea["textarea.tsx"]
        Tabs["tabs.tsx"]
    end

    subgraph Styles["Styles"]
        direction LR
        Tailwind["tailwind.css"]
        Theme["theme.css"]
        Index["index.css"]
    end

    subgraph Backend["Backend (Supabase Edge Functions)"]
        direction TB
        Server["server/index.tsx"]
        KV["kv_store.tsx"]
    end

    subgraph API["API Endpoints"]
        direction TB
        AuthAPI["/signup, /signin"]
        SessionAPI["/sessions, /session"]
        ReflectAPI["/reflection"]
        FeedbackAPI["/feedback"]
        UploadAPI["/upload-screenshot"]
    end

    subgraph Data["Data Flow"]
        direction LR
        Users["Users"]
        Sessions["Sessions"]
        Reflections["Reflections"]
        Feedback["Feedback"]
    end

    Frontend --> API
    API --> Backend
    Backend --> KV
    KV --> Data
    UI --> Frontend
    Styles --> Frontend
```

## Directory Structure

```
berghaus/
├── src/
│   ├── main.tsx                 # App entry point
│   ├── app/
│   │   ├── App.tsx              # Main app with routing/auth
│   │   └── components/
│   │       ├── auth-page.tsx        # Login/signup
│   │       ├── organizer-dashboard.tsx  # Session management
│   │       ├── student-dashboard.tsx    # Student hub
│   │       ├── ai-reflection.tsx        # AI conversation
│   │       ├── peer-critique.tsx        # Feedback carousel
│   │       ├── feedback-view.tsx        # View received feedback
│   │       └── ui/                      # Reusable UI components
│   ├── styles/
│   │   ├── index.css
│   │   ├── tailwind.css
│   │   └── theme.css
│   └── utils/
│       └── supabase/client.ts   # Supabase client
├── supabase/
│   └── functions/server/
│       ├── index.tsx            # API routes
│       └── kv_store.tsx         # Data persistence
└── config files (package.json, vite.config.ts, etc.)
```

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase Edge Functions
- **Database**: Supabase (KV Store)

## Development Commands

```bash
npm install      # Install dependencies
npm run dev      # Start development server
npm run build    # Build for production
```
