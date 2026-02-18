import { Injectable, OnDestroy } from '@angular/core'
import { Store } from '@ngrx/store'
import { BehaviorSubject, Subscription } from 'rxjs'
import { AppState, BirdCard, isBirdOrHummingbirdCard } from './store/app.interfaces'
import * as appActions from './store/app.actions'

@Injectable({
  providedIn: 'root'
})
export class PlaylistAudioService implements OnDestroy {
  private audioElement: HTMLAudioElement | null = null
  private storeSubscription: Subscription
  private fadeTimer: any
  private currentBirdCard: BirdCard | null = null

  constructor(private store: Store<{ app: AppState }>) {
    this.initializeService()
  }

  private initializeService(): void {
    // Subscribe to specific playlist properties that should trigger audio changes
    this.storeSubscription = this.store.select(({ app }) => ({
      isPlaying: app.playlist.isPlaying,
      currentBirdId: app.playlist.currentBirdId,
      volume: app.playlist.volume,
      birdCards: app.birdCards
    })).subscribe(({ isPlaying, currentBirdId, volume, birdCards }) => {
      // Only handle changes that actually affect playback
      this.handlePlaybackChange({ isPlaying, currentBirdId, volume, birdCards })
    })
  }

  private handlePlaybackChange(state: { isPlaying: boolean, currentBirdId: number | null, volume: number, birdCards: any[] }): void {
    // Handle play/pause state changes
    if (state.isPlaying) {
      if (!this.audioElement || state.currentBirdId !== this.currentBirdCard?.id) {
        // Start playing new song or resume from stopped state
        this.playCurrentSong(state)
      } else if (this.audioElement.paused) {
        // Resume paused audio
        this.resumeAudio()
      }
    } else if (!state.isPlaying) {
      // Stop playback
      this.stopAudio()
    }

    // Handle volume changes
    if (this.audioElement && this.audioElement.volume !== state.volume) {
      this.audioElement.volume = state.volume
    }
  }

  private playCurrentSong(state: { isPlaying: boolean, currentBirdId: number | null, volume: number, birdCards: any[] }): void {
    if (state.currentBirdId === null) {
      this.store.dispatch(appActions.stopPlaylist())
      return
    }

    // Find the current bird card - only look in actual bird cards since bonuses don't have recordings
    const currentBirdCard = state.birdCards
      .find(card => card.id === state.currentBirdId)

    if (!currentBirdCard || !currentBirdCard.recordings || currentBirdCard.recordings.length === 0) {
      // Skip to next song if current bird has no recordings
      this.store.dispatch(appActions.nextSong())
      return
    }

    // Only stop current audio if we're switching to a different bird
    if (this.currentBirdCard?.id !== currentBirdCard.id) {
      this.stopAudio()
      this.currentBirdCard = currentBirdCard
    } else {
      // Same bird, don't restart audio
      return
    }

    // Select a random recording from the current bird
    const randomIndex = Math.floor(Math.random() * currentBirdCard.recordings.length)
    const selectedRecording = currentBirdCard.recordings[randomIndex]

    // Create new audio element
    this.audioElement = new Audio(selectedRecording)
    this.audioElement.volume = 0 // Start at 0 volume for fade-in

    // Handle audio events
    this.audioElement.addEventListener('canplay', () => {
      if (this.audioElement) {
        this.audioElement.play().then(() => {
          // Start volume fade-in after playback begins
          this.fadeInVolume(state.volume)
        }).catch(error => {
          console.warn('Playlist audio playback failed:', error)
          // Skip to next song on playback failure
          this.store.dispatch(appActions.nextSong())
        })
      }
    })

    this.audioElement.addEventListener('error', (error) => {
      console.warn('Playlist audio loading failed:', error)
      // Skip to next song on loading failure
      this.store.dispatch(appActions.nextSong())
    })

    this.audioElement.addEventListener('ended', () => {
      // Song finished, advance to next
      this.store.dispatch(appActions.playlistSongEnded())
    })

    // Load the audio
    this.audioElement.load()
  }

  private fadeInVolume(targetVolume: number): void {
    if (!this.audioElement) return

    const fadeSteps = 50 // Number of volume steps
    const fadeInterval = 30 // Milliseconds between steps (1.5 second total fade)
    const volumeStep = targetVolume / fadeSteps

    let currentStep = 0
    this.fadeTimer = setInterval(() => {
      if (!this.audioElement || currentStep >= fadeSteps) {
        clearInterval(this.fadeTimer)
        this.fadeTimer = null
        return
      }

      currentStep++
      this.audioElement.volume = Math.min(volumeStep * currentStep, targetVolume)

      if (currentStep >= fadeSteps) {
        clearInterval(this.fadeTimer)
        this.fadeTimer = null
      }
    }, fadeInterval)
  }

  private pauseAudio(): void {
    if (this.audioElement && !this.audioElement.paused) {
      this.audioElement.pause()
    }
  }

  private resumeAudio(): void {
    if (this.audioElement && this.audioElement.paused) {
      this.audioElement.play().catch(error => {
        console.warn('Playlist audio resume failed:', error)
        // Skip to next song on resume failure
        this.store.dispatch(appActions.nextSong())
      })
    }
  }

  private stopAudio(): void {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer)
      this.fadeTimer = null
    }

    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.currentTime = 0
      this.audioElement = null
    }

    this.currentBirdCard = null
  }


  ngOnDestroy(): void {
    if (this.storeSubscription) {
      this.storeSubscription.unsubscribe()
    }
    this.stopAudio()
  }
}