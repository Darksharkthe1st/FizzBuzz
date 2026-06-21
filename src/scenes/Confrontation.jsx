import { useState } from 'react'
import { CONVO_STATE } from '../state/machine'
import styles from './Confrontation.module.css'

export default function Confrontation({ state, dispatch }) {
  const [userInput, setUserInput] = useState('')
  const { convoState, currentReply, currentMood, roommateImage } = state

  const isIdle     = convoState === CONVO_STATE.IDLE
  const isThinking = convoState === CONVO_STATE.THINKING
  const isTalking  = convoState === CONVO_STATE.TALKING

  function sendMessage(text) {
    const trimmed = text.trim()
    if (!trimmed || !isIdle) return
    setUserInput('')
    dispatch({ type: 'SEND_MESSAGE', text: trimmed })
    // TODO (Person C): replace the block below with real POST /api/roommate
    setTimeout(() => {
      dispatch({
        type: 'GOT_REPLY',
        reply: "Look, I just thought the freezer could use some refreshments, okay? It's not a big deal.",
        mood: 'defensive',
      })
    }, 1200)
    setTimeout(() => dispatch({ type: 'DONE_TALKING' }), 5000)
  }

  return (
    <div className={styles.scene}>
      {/* Doorframe + roommate */}
      <div className={styles.doorframeArea}>
        <div className={styles.doorframe}>

          {/* Room ambient */}
          <div className={styles.roomAmbient} />

          {/* Roommate figure */}
          <div className={`${styles.roommate} ${isTalking ? styles.talking : ''}`}>
            {roommateImage ? (
              <div className={styles.headWrap}>
                <img
                  src={roommateImage}
                  alt="Your roommate"
                  className={styles.headImg}
                  draggable={false}
                />
              </div>
            ) : (
              <div className={styles.defaultHead}>😤</div>
            )}
            {/* Tiny squished body — the 0.5-zoom meme effect */}
            <div className={styles.body} />
          </div>

          {/* Video loop slot — Person B drops <video> here */}
          {isTalking && (
            <div className={styles.videoSlot} aria-hidden="true">
              <span className={styles.yappingTag}>yapping</span>
            </div>
          )}
        </div>

        {/* Mood badge */}
        {currentMood && currentMood !== 'idle_yap' && (
          <div className={styles.moodBadge}>
            {currentMood.replace('_', ' ')}
          </div>
        )}
      </div>

      {/* Subtitles */}
      <div className={styles.subtitleBand}>
        {isTalking && currentReply && (
          <p className={styles.subtitle} key={currentReply}>
            {currentReply}
          </p>
        )}
        {isThinking && (
          <p className={styles.thinking}>…</p>
        )}
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        <form
          className={styles.form}
          onSubmit={e => { e.preventDefault(); sendMessage(userInput) }}
        >
          <input
            className={styles.input}
            type="text"
            value={userInput}
            onChange={e => setUserInput(e.target.value)}
            placeholder={isIdle ? 'Say something to your roommate…' : ''}
            disabled={!isIdle}
            autoFocus
          />
          <button
            type="submit"
            className={styles.sendBtn}
            disabled={!isIdle || !userInput.trim()}
          >
            {/* TODO (Person C): add mic button here */}
            Send
          </button>
        </form>
      </div>
    </div>
  )
}
