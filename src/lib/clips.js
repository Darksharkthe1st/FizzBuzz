export const MOOD_CLIPS = {
  defensive:      '/clips/defensive.mp4',
  dismissive:     '/clips/dismissive.mp4',
  fake_apologetic:'/clips/fake_apologetic.mp4',
  deflecting:     '/clips/deflecting.mp4',
  escalating:     '/clips/escalating.mp4',
  gaslighting:    '/clips/gaslighting.mp4',
  idle_yap:       '/clips/idle_yap.mp4',
}

export function getClip(mood) {
  return MOOD_CLIPS[mood] ?? MOOD_CLIPS.idle_yap
}
