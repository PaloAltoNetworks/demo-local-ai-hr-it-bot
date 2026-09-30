# What's new in The Otter

The Otter is an HR and IT assistant that shows how the Prisma AIRS AI Gateway keeps a company
chatbot reliable and safe. Newest version first.

## 0.0.26

### Auto mode: the Prisma AIRS AI Gateway picks the cloud for you
The LLM Provider menu now opens on **Auto**. Instead of pinning one cloud, you let the AI Gateway
spread questions across AWS, Google Cloud and Azure, and switch to another cloud on its own if one
of them has a problem. In the demo, this shows that the assistant keeps answering even when a
provider goes down, with no change in the app. You can still pick AWS, GCP or Azure to force a
single cloud.

### Sharper answers
Answers are now written by Claude Sonnet 5.5 on every cloud, for clearer and more complete
replies. A faster model still does the quick thinking steps, so replies stay snappy.

### See the assistant think
Each reply shows its reasoning step by step: what it understood, which company data it looked up
(HR records, IT tickets, laptops), and what it concluded. You can open each step to see exactly
what was fetched. Every reply also lets you retry, copy, rate it, and open its full trace in the
AI Gateway.

### Watch a request travel through the AI Gateway
The new **workflow replay** (route icon in the header) animates the path of a question: from the
app to the AI Gateway, to the HR and IT data, to the cloud models, and through Prisma AIRS in
protected mode. It is the fastest way to explain the architecture to an audience.

### IT requests handled end to end
Ask for USB access, a software install or a laptop replacement: an IT triage assistant finds the
right procedure, checks your details, asks for anything missing, and files the ticket with the right
priority and approver.

### Safer by design
The assistant only accepts well-formed requests for company data (ticket numbers, employee IDs,
emails), so tricks like hiding instructions inside a request field are rejected before any data is
touched. In protected mode, Prisma AIRS still screens every question and answer.

### Always a clean demo
The demo data (employees, tickets, laptops) returns to its original state on every restart, so
each audience sees the same story.

### Also
- A "try Auto" tip for people who had picked a single cloud before.
- This page: click the version number in the suggestions panel to see what's new.
- Smoother display in dark mode and a roomier provider menu.

## 0.0.25
- Other AI assistants can connect to The Otter's IT data, not just its own chat.

## 0.0.24
- The IT data (tickets, history) is available to external AI assistants as a ready-to-use service.

## 0.0.23
- Behind-the-scenes improvements.

## 0.0.22
- The "How can you help me?" suggestion uses a formal tone in all 9 languages.

## 0.0.21
- New first suggestion, "How can you help me?", to discover what the assistant can do, in all
  9 languages.
