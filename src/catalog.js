export const topics = [
  { id: 'manipulation', name: 'Manipulation', pattern: /manipulat|grasp|pick.and.place|assembly|insertion|dexter|gripper|in.hand|bimanual|tool.use/i },
  { id: 'generalist', name: 'Generalist policies', pattern: /\bvla\b|vision.language.action|generalist|foundation model|cross.embodiment|embodiment.agnostic/i },
  { id: 'locomotion', name: 'Locomotion', pattern: /locomotion|humanoid|quadruped|legged|walking|gait|loco.manipulation|whole.body/i },
  { id: 'world-models', name: 'World models', pattern: /world.model|world.action|dynamics|video.prediction|simulation|sim.to.real|sim2real|digital.twin/i },
  { id: 'learning', name: 'Learning from demos', pattern: /imitation|demonstration|human.video|human.centric|human.to.robot|learning.from|behavior.cloning|behaviour.cloning|teleoperat/i },
  { id: 'reinforcement', name: 'Reinforcement learning', pattern: /reinforcement|\brl\b|reward|policy.optimization|online.learning/i },
  { id: 'planning', name: 'Planning & reasoning', pattern: /planning|reasoning|long.horizon|task.and.motion|agentic|compositional/i },
  { id: 'perception', name: 'Perception & navigation', pattern: /perception|navigation|slam|mapping|autonomous.driv|spatial|3d|scene|localization/i },
  { id: 'touch', name: 'Touch & contact', pattern: /tactile|touch|contact|force|haptic|soft.robot|deformable/i },
  { id: 'evaluation', name: 'Data & evaluation', pattern: /benchmark|dataset|evaluat|data.collect|data.scal|data.curation|safety|safe\b|robust|uncertainty/i },
  { id: 'other', name: 'Other robot learning', pattern: null },
];

export function tagPaper(paper) {
  const tags = topics.filter(t => t.pattern?.test(paper.title)).map(t => t.id);
  const taskTags = tasks.filter(t => t.pattern.test(paper.title)).map(t => t.id);
  return { ...paper, topics: tags.length ? tags : ['other'], tasks: taskTags };
}

export const tasks = [
  {id:'manipulation',name:'Manipulation',pattern:/manipulat|pick.and.place/i},
  {id:'grasping',name:'Grasping',pattern:/grasp|gripper|in.hand|dexter/i},
  {id:'bimanual',name:'Bimanual',pattern:/bimanual|dual.arm|two.hand/i},
  {id:'assembly',name:'Assembly',pattern:/assembly|insertion|peg.in.hole/i},
  {id:'locomotion',name:'Locomotion',pattern:/locomotion|walking|gait|legged|quadruped/i},
  {id:'whole-body',name:'Whole-body control',pattern:/humanoid|whole.body|loco.manipulation/i},
  {id:'navigation',name:'Navigation',pattern:/navigat|slam|path.plan|localization/i},
  {id:'deformables',name:'Deformables',pattern:/deformable|cloth|rope|fabric|garment/i},
  {id:'tool-use',name:'Tool use',pattern:/tool.use|tool.manipulat|tool.learn/i},
  {id:'driving-flight',name:'Driving & flight',pattern:/driving|quadrotor|drone|aerial|flight/i},
];

export function filterPapers(papers, state, saved = new Set()) {
  const words = state.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const result = papers.filter(p =>
    (state.year === 'all' || p.year === Number(state.year)) &&
    (!state.topic || p.topics.includes(state.topic)) &&
    (!state.task || p.tasks.includes(state.task)) &&
    (!state.presentation || (p.presentation === state.presentation || p.presentations?.includes(state.presentation))) &&
    (!state.savedOnly || saved.has(p.id)) &&
    words.every(word => [p.title, ...(p.authors || []), p.tldr || '', p.abstract || '', ...(p.keywords || []), ...p.topics.map(id => topics.find(t => t.id === id).name), ...p.tasks.map(id => tasks.find(t=>t.id===id).name)].join(' ').toLowerCase().includes(word))
  );
  return result.sort(state.sort === 'title'
    ? (a, b) => a.title.localeCompare(b.title)
    : (a, b) => b.year-a.year || Number(Boolean(b.figure)) - Number(Boolean(a.figure)) || (({Oral:0,Spotlight:1,Poster:2}[a.presentation]??3) - ({Oral:0,Spotlight:1,Poster:2}[b.presentation]??3)) || a.title.localeCompare(b.title));
}

export function shortSummary(text) {
  if (!text) return '';
  if (text.length <= 120) return text;
  return text.slice(0, 119).replace(/\s+\S*$/, '') + '…';
}
