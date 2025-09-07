## Game Design Scaffold

### Core Pillars
- Accessibility, agency, positive reinforcement

### Systems
- Character Customization: avatar parameters, consistent visual style
- Story: branching nodes with conditions and rewards
- Chat: NPC personalities, safety filters, age-appropriate tone
- Items: consumables and cosmetics affecting engagement
- Achievements: clear goals with small wins

### Content Model
- `story_nodes`: id, text, choices[], conditions[], rewards[]
- `choices`: id, label, next_node_id, cost, requirements
- `inventory_items`: id, name, type, effect
- `achievements`: id, name, trigger, reward

### Safety & Privacy
- Filter prompts/outputs, log flagged content, guardian mode
