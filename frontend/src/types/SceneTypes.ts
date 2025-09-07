export interface SceneLocation {
  name: string;
  reference_image: string;
  description: string;
}

export interface SceneStyle {
  art_style: string;
  palette: string;
  details: string;
}

export interface SceneCharacter {
  name: string;
  role: string;
  description: string;
  emotion: string;
}

export interface SceneProp {
  name: string;
  description: string;
}

export interface SceneContext {
  event: string;
  mission_status: string;
  player_status: string;
}

export interface SceneDialogue {
  speaker: string;
  text: string;
}

export interface SceneChoice {
  text: string;
  next_scene_id: string;
  consequence?: string;
}

export interface SceneData {
  scene_id: string;
  scene_name: string;
  location: SceneLocation;
  time_of_day: string;
  atmosphere: string;
  main_focus: string;
  style: SceneStyle;
  characters: SceneCharacter[];
  props: SceneProp[];
  action: string;
  context: SceneContext;
  dialogue: SceneDialogue;
  choices?: SceneChoice[];
  next_scene_id?: string;
}

export interface GeneratedScene {
  scene_id: string;
  scene_name: string;
  background_image_url: string;
  character_images: {
    [characterName: string]: string;
  };
  dialogue: SceneDialogue;
  choices?: SceneChoice[];
  next_scene_id?: string;
}
