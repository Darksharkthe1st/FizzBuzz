import { useReducer } from 'react'
import { reducer, initialState } from './state/machine'
import Landing from './scenes/Landing'
import Setup from './scenes/Setup'
import Knocking from './scenes/Knocking'
import Confrontation from './scenes/Confrontation'

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState)

  return (
    <div className="app">
      {state.scene === 'landing' && <Landing dispatch={dispatch} />}
      {state.scene === 'setup' && <Setup dispatch={dispatch} />}
      {state.scene === 'knocking' && (
        <Knocking
          dispatch={dispatch}
          situation={state.situation}
          roommateImage={state.roommateImage}
        />
      )}
      {state.scene === 'confrontation' && (
        <Confrontation state={state} dispatch={dispatch} />
      )}
    </div>
  )
}
