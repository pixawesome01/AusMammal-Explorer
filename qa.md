# Mid-semester Pitch Q&A

Keep each answer to about 20–30 seconds. If a question belongs to another section, give a short answer first and then hand over to the relevant presenter.

## Shu Sato — Overview, current issues, mobile UI and MapLibre

### How did you implement clustering?

We use MapLibre's native GeoJSON clustering. Our current settings are:

- `clusterRadius = 52`: nearby records within a radius of approximately 52 pixels are grouped.
- `clusterMinPoints = 2`: at least two records are required to form a cluster.
- `clusterMaxZoom = 11`: clustering is used up to zoom level 11, and records are shown individually from zoom level 12.

The cluster circles also change size at 100 and 1,000 records so dense areas remain readable.

### Why did you choose React Native?

React Native lets us build the iOS and Android apps from one shared TypeScript project. This reduces duplicated work, but we still need to test physical iPhones and Android phones for platform-specific layout, permission and performance issues.

### Why did you choose MapLibre?

MapLibre supports native mobile maps, GeoJSON data and zoom-based clustering. It lets us display a large number of occurrence records while keeping the map interactive and readable.

### Why are you using a frozen ALA snapshot instead of live API calls?

The frozen snapshot keeps the map, tests and presentation consistent throughout the semester. It is also faster and more reliable for the demo than depending on a live ALA request. We retain the snapshot date, filtering steps, licence and attribution so the data remains traceable.

### How is the occurrence data loaded by the app?

The app bundles a deterministic sample of 600 records per species for a reliable demo. The complete per-species GeoJSON files are kept outside the app and can be downloaded from a configured server. We still need to verify full-data loading time, memory use and error handling on physical devices.

### How will the time filters keep the map, count and data panel consistent?

All three views will use the same filtered collection of records. For example, if a filter leaves 25 records, the map displays those 25 records, the count shows 25, and the data panel summarises the same 25 records.

### What are the main technical issues still being addressed?

We still need to verify consistent behaviour on physical iOS and Android devices, test the complete dataset on those devices, and confirm that time-filter results remain consistent across every view.

## Nethra Yamala — Project management, roles and progress

### What project management methodology are you using?

We use Scrum adapted to the university semester. The work is divided into six two-week sprints, with checkpoints and pitch milestones aligned to the teaching schedule. This gives us short delivery cycles while keeping the final deadline visible.

### Why do you call it Scrum if you also use a board with Kanban columns?

Scrum defines our sprint planning, sprint goals and review cycle. Within each sprint, the Jira board shows the daily flow of work through backlog, ready, in progress and done. The board supports Scrum; it does not replace it.

### How do you move work from the product backlog into a sprint?

User stories stay in the product backlog until they are prioritised by user value, dependencies and the RTM. During sprint planning, selected stories are split into measurable subtasks with acceptance criteria and moved into the sprint backlog.

### How are tasks allocated to team members?

We allocate subtasks according to the required skills and each member's current workload. Every subtask has one owner for accountability, while pairing and code review are used when the task crosses technical areas or needs another perspective.

### How do you track and document progress?

Jira tracks stories, subtasks, owners and sprint status. The RTM connects each requirement to its acceptance criteria and implementation evidence, while GitHub records code changes and reviews. Together, they show both project progress and technical evidence.

### What does “Done” mean for a task?

A task is done when its acceptance criteria are met, the relevant checks pass, the work has been reviewed where needed, and it is integrated into the shared codebase. Moving a Jira issue to Done by itself is not enough.

### What do you do when a sprint is falling behind?

We review dependencies and workload, reassign or pair on blocked subtasks, and protect the seven-species core journey. Lower-priority features are moved to a later sprint instead of weakening the acceptance criteria for the MVP.

### How is progress tracking against the schedule?

Sprint 1 completed the data pipeline. Sprint 2 completed the seven-species selector and MapLibre map flow. Sprint 3 is focused on time filters and keeping the map, count and data panel synchronised. We compare each sprint result with the milestone schedule and RTM acceptance criteria.

## Kok Hee Tan — Current risks and anticipated issues

### What is the difference between a current issue, a risk and an anticipated issue?

A current issue is already affecting the project and needs action now. A risk is an uncertain event that we monitor using probability and impact. An anticipated issue is not active yet, but is likely to appear as we add features or move toward release.

### Why is scope creep rated as an Extreme risk?

Extra species, environmental layers and modelling can quickly expand the work beyond the core journey. We rated it high in both probability and impact. Our response is to protect the seven-species MVP and move additional features to later sprints until the core map is stable.

### Why is the team bottleneck rated as an Extreme risk?

Integration work can accumulate on one or two members, which delays delivery and reduces review quality. We assigned a clear owner for integration, merged the separate work streams into main, and fixed the resulting Expo and lint issues.

### How are you addressing the map-performance risk?

We load one species at a time, use per-species prepared data and apply native zoom-based clustering. For the demo, we also use a smaller deterministic sample. We will profile the complete dataset on physical devices before expanding the number of records or layers.

### What is the difference between mitigation and contingency?

Mitigation reduces the probability or impact before a risk occurs. A contingency is the action taken when the risk trigger appears. For example, limiting the MVP is scope mitigation, while moving time filters and environmental context to Sprint 3 was an applied scope contingency.

### How do you monitor whether a risk is becoming more serious?

At sprint reviews, we check the risk trigger, probability, impact, owner and response. Evidence such as loading time, blocked integration work or missed acceptance criteria tells us whether the rating or contingency needs to change.

### Why might the future MaxEnt layer be misunderstood?

MaxEnt estimates habitat suitability; it does not prove that a species is present or guarantee a sighting. We will add a warning that the result shows habitat suitability, not confirmed presence, and we will present the model's validation evidence with the layer.

### What would you do if map loading remains slow?

We would measure whether the bottleneck is download size, parsing, memory use or rendering. We could then reduce the payload, keep the files separated by species, pre-aggregate the data further, or change the hosted delivery format before adding more features.

## William Koo — Requirements, end-user validation and conclusion

### How does the RTM help the project?

The RTM connects every requirement to its category, acceptance criteria, sprint target and implementation evidence. It helps us check that completed code addresses an agreed requirement rather than only adding features that look useful.

### Why does the RTM mention five species while the app contains seven?

The original requirement established a minimum set of five species. After data screening, we included two additional species while keeping the selector limited to a seven-species MVP. The RTM and SMART goal wording should remain aligned with the implemented seven-species scope.

### How did you use the first user survey?

The survey helped us identify what information users consider useful when exploring mammals. We used those responses to prioritise the map, time exploration and understandable contextual information. The survey informs the design, but it does not replace testing the working interface.

### How will you validate the working application with end users?

We will give users the core task of choosing a species, exploring the map and applying a time filter. We will record task completion, errors and confidence, then ask whether the labels and results were understandable.

### What happens if users cannot complete the core task?

We will treat the failed step as evidence, create Jira subtasks for the problem and update the relevant acceptance criteria. We will improve the core map and test it again before adding environmental context or the MaxEnt layer.

### How do you know that a requirement has been met?

We need three things: the feature must be implemented, its measurable acceptance criteria must pass, and the evidence must be recorded against the requirement in the RTM. A Jira status alone does not prove that a requirement is satisfied.

### Is the MaxEnt layer part of the required MVP?

No. R13 describes it as an optional layer. Our decision rule is to validate the core seven-species journey first, then add the model only if time, performance and validation evidence support it.

### What are the main limitations users need to understand?

The map shows past occurrence records, not guaranteed current presence. Records can also reflect observation effort and reporting bias. Any future MaxEnt result will be labelled as habitat suitability rather than confirmed presence.

## Questions any team member should be ready to answer

### What is the core value of AusMammal Explorer?

It turns a large occurrence dataset into an understandable mobile journey: choose a mammal, explore where and when it has been recorded, and see the data source and limitations without reading raw tables.

### What is your priority if the remaining time becomes limited?

We will protect the complete core journey: species selection, a readable clustered map, consistent time filters and transparent data information. Optional modelling and environmental context come after that journey is stable and validated.

### What is the strongest evidence of progress so far?

The project has a reproducible data pipeline, a working seven-species selector, a MapLibre map with native clustering, and traceable requirements and sprint evidence. The next milestone is to complete and validate the shared time-filter flow.
