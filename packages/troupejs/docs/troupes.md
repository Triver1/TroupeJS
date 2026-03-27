# Troupes

A `troupe` is a group of agents that can communicate and coordinate.

Troupes are for shared collaboration between agents.

They are different from subagents:

- subagents are private and parent-owned
- troupes are shared and multi-agent

## Example

```ts
const troupe = new Troupe({
  name: "product-team",
  troupeDescription: "Agents collaborating on product work",
  agents: [manager, researcher],
});
```

Constructor form:

```ts
const troupe = new Troupe([manager, researcher]);
```

## Troupe API

API:

- `new Troupe(agents)`
  Creates a troupe from a list of agents.

- `troupe.send(message)`
  Sends a troupe-wide message.

- `troupe.sendTo(agentName, message)`
  Sends a directed message to a specific troupe member.

- `troupe.addAgent(agent)`
  Adds an agent to the troupe.

- `troupe.removeAgent(agentName)`
  Removes an agent from the troupe.

## Membership Rules

- troupe membership is explicit
- subagents are not troupe members by default
- if a subagent participates in a troupe, it is explicitly added
- each troupe member has a unique agent name inside the troupe
- adding an agent with a duplicate name is an error

## Message Rules

- a troupe has troupe-wide messages and directed messages
- a troupe-wide message is visible to every troupe member
- a directed message is visible only to the named target
- if a directed target does not exist, the troupe throws an error

## Delivery Rules

- `troupe.send(message)` delivers the message to every troupe member
- `troupe.sendTo(agentName, message)` delivers the message only to the named target
- troupe-wide messages run through the troupe conversation engine
- replies are posted round by round

## Reply Rules

- an agent can reply or stay silent
- an agent stays silent when it has nothing useful or relevant to add
- troupe members do not post near-duplicate replies
- directed replies come only from the target agent
- troupe-wide replies are visible to the troupe
- directed replies are visible only to the sender and the target
- subagent messages stay private to the parent agent unless the parent forwards them into the troupe

## Coordination Rules

- not every agent answers every troupe-wide message
- agents respond when the message is relevant to their role, tools, or subagents
- troupe conversations are multi-round by default
- an agent does not answer the same message twice unless a new message reopens it

## Conversation Config

You can tune the troupe conversation engine by passing a `conversation`
config when constructing a troupe:

```ts
const troupe = new Troupe({
  name: "support-inbox",
  agents: [triage, policy, replyWriter],
  conversation: {
    routerName: "triage",
    maxRounds: 6,
    maxParticipants: 4,
  },
});
```

During troupe runs, agents can call:

- `askGroup` to queue a troupe-wide question for the next round
