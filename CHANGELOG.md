# What's new in The Otter

The Otter is an HR and IT assistant that shows how the Prisma AIRS AI Gateway keeps a company
chatbot reliable and safe. Newest version first.

## 0.1.6

### A preview to try what is coming
New versions now land first on https://otter-preview.panw.pro, a beta instance where they are
tested before reaching https://otter.panw.pro. You sign in once for both. Present from
otter.panw.pro; look at the preview to see what the next version brings.

### The identity replay shows the target model
The Identity view of the workflow replay now plays the target model hop by hop: the user signs
in to Idira Identity, the assistant proves who it is with its Idira Secure Workload Access
identity, and one delegated token carries both to the AI Gateway and the tools.

### Tokens only open what the person may reach
Alex Morgan's tokens are no longer issued for the HR tools at all: the gateway refuses them, and
the HR tools would reject them too. Employees' tokens still cover HR and IT.

### Tools keep answering after an update
The assistant no longer loses its tools when a tool server restarts during an update: it
reconnects and retries the request on its own.

## 0.1.5

### The Otter moves to otter.panw.pro
The Otter now lives at https://otter.panw.pro, and you sign in at auth.panw.pro. The previous
version that answered there is retired. If you were already signed in, your session carries over.

## 0.1.4

### Protected mode answers legitimate questions
In protected mode, the guardrails no longer block normal answers built from an HR record or an IT
ticket as off-topic. Asking for remaining leave as Aurélien now gets the answer, while Alex is
still refused by the AI Gateway.

### Three identity questions, one contrast each
The protected mode examples are down to three: remaining leave as Aurélien (allowed), the same
question as Alex (refused), and opening an IT ticket as Alex (allowed).

## 0.1.3

### Act as four different people
A new menu in the header lets you act as Aurélien Girard (employee), Sophie Martin (Aurélien's manager),
Lisa Wang (HR director) or Alex Morgan (an external contractor), without signing in again. Each
one has its own icon and colour, and the assistant greets you by that name.

### Protected mode checks who is asking
In protected mode, the AI Gateway and every tool check the identity of the person behind the
question. Aurélien reads their own record but not Sophie's, Sophie sees their team, Lisa sees
everyone, and Alex can open IT tickets but cannot reach HR data at all. In normal and risky
modes the assistant still uses its own all-access identity, so you can compare.

### See the refusals happen
When a tool call is refused, it stays in the reasoning steps with a red "Denied" mark and says
who refused it: the AI Gateway or the tool itself. Every tool now shows which server it belongs
to, and the questions in protected mode tell you which person they switch to and whether access
is expected (green check) or refused (red cross).

### Logs show the persona, and who was testing
Gateway logs show the persona's email as the user, and keep the real signed-in account in a
separate `login_email` field. Hover the gateway logo under an answer to see both, plus whose
identity the tools received.

### The identity replay follows two people
The Identity view of the workflow replay now plays Aurélien's and Alex's requests hop by hop,
from sign-in to the tools, and shows where Alex is stopped.

### Fixes
The assistant no longer tries every tool in turn when one is refused, and IT ticket triage keeps
working after the tools server restarts.

## 0.1.2

### The assistant proves who it is, without an API key
The Otter now reaches the Prisma AIRS AI Gateway with a short-lived identity issued by Idira
Secure Workload Access instead of a stored API key. Hover the gateway logo under an answer to see
how it was authenticated: a blue mark means the workload identity was used.

### HR data only through the AI Gateway
The HR records can no longer be read by calling their tools directly inside the cluster: every
request must carry an identity signed by the AI Gateway, so it is always inspected and logged.

### Identity explained in the workflow replay
The workflow replay has a new Identity view. It walks through how a workload gets its identity on
Kubernetes and how the gateway checks it, and compares today's setup with the target model where
every tool verifies who is calling and for which user. Hover any component for an explanation.

### Trace links are back
The gateway logo next to each answer opens its trace in Strata Cloud Manager again.

## 0.1.1

### Sign in with your company email
The Otter now asks who you are before it answers. Enter your `@paloaltonetworks.com` address and
click the link you receive by email: you stay signed in for a week. There is no seat limit, so you
can share the demo link with as many colleagues and customers as you need.

### The whole demo runs in one Kubernetes cluster
The assistant, the HR and IT data, and the Prisma AIRS AI Gateway now run side by side in a
Kubernetes cluster on AWS. Model and tool calls stay inside the cluster, so replies are quicker
and the demo keeps running even when one component restarts. Only the sign-in page and the chat
are reachable from the internet.

## 0.1.0

### Load balance & fallback: the Prisma AIRS AI Gateway picks the cloud for you
The LLM Provider menu now opens on **Load balance & fallback**. Instead of pinning one cloud, you let the AI Gateway
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
- A tip to try load balance & fallback for people who had picked a single cloud before.
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
