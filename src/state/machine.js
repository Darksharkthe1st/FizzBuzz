export const SCENES = {
  LANDING: 'landing',
  SETUP: 'setup',
  KNOCKING: 'knocking',
  CONFRONTATION: 'confrontation',
}

export const CONVO_STATE = {
  IDLE: 'idle',
  LISTENING: 'listening',
  THINKING: 'thinking',
  TALKING: 'talking',
}

export const initialState = {
  scene: SCENES.LANDING,
  convoState: CONVO_STATE.IDLE,
  situation: '',
  roommateImage: null,
  history: [],
  currentReply: '',
  currentMood: 'idle_yap',
}

export function reducer(state, action) {
  switch (action.type) {
    case 'GO_SETUP':
      return { ...state, scene: SCENES.SETUP }

    case 'START_KNOCKING':
      return {
        ...state,
        scene: SCENES.KNOCKING,
        situation: action.situation,
        roommateImage: action.roommateImage,
      }

    case 'DOOR_OPENED':
      return { ...state, scene: SCENES.CONFRONTATION, convoState: CONVO_STATE.IDLE }

    case 'SEND_MESSAGE':
      return {
        ...state,
        convoState: CONVO_STATE.THINKING,
        history: [...state.history, { role: 'user', content: action.text }],
      }

    case 'GOT_REPLY':
      return {
        ...state,
        convoState: CONVO_STATE.TALKING,
        currentReply: action.reply,
        currentMood: action.mood,
        history: [...state.history, { role: 'roommate', content: action.reply }],
      }

    case 'DONE_TALKING':
      return { ...state, convoState: CONVO_STATE.IDLE, currentReply: '' }

    default:
      return state
  }
}
