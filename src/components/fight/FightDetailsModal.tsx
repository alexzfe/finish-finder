'use client'

import { Fragment } from 'react'
import { Dialog, Transition } from '@headlessui/react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { Fight } from '@/types'

interface FightDetailsModalProps {
  fight: Fight | null
  isOpen: boolean
  onClose: () => void
}

const formatWeightClass = (weightClass?: string | null): string => {
  if (!weightClass) {
    return 'TBD'
  }
  return weightClass
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function FightDetailsModal({ fight, isOpen, onClose }: FightDetailsModalProps) {
  if (!fight) return null

  return (
    <Transition show={isOpen} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        {/* Backdrop */}
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" />
        </Transition.Child>

        {/* Modal container */}
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-[calc(100vw-2rem)] sm:max-w-md transform rounded-2xl border border-white/10 bg-black/90 p-4 sm:p-6 text-white shadow-2xl transition-all">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <Dialog.Title className="ufc-condensed text-xs text-white/70">
                    Featured Bout
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {/* Accessibility Description */}
                <Dialog.Description className="sr-only">
                  Fight details for {fight.fighter1?.name || 'TBD'} vs {fight.fighter2?.name || 'TBD'}
                </Dialog.Description>

                {/* Fight Header */}
                <div className="border-l-4 border-[var(--ufc-red)] pl-4 mb-6">
                  <h3 className="ufc-condensed text-xl text-white leading-tight">
                    {fight.fighter1?.name || 'TBD'} vs {fight.fighter2?.name || 'TBD'}
                  </h3>
                  <p className="text-xs uppercase tracking-[0.4em] text-white/50 mt-1">
                    {formatWeightClass(fight.weightClass)} • {fight.scheduledRounds || 3} Rounds
                    {fight.titleFight ? ' • Title Fight' : ''}
                    {fight.mainEvent && !fight.titleFight ? ' • Main Event' : ''}
                  </p>
                </div>

                {/* Stats Grid */}
                <div className="grid gap-3 mb-5">
                  <div className="rounded-xl bg-white/5 px-4 py-3.5">
                    <span className="block text-[0.7rem] md:text-[0.75rem] text-white/70">Fun Score</span>
                    <span className="ufc-condensed text-3xl text-[var(--ufc-red)]">
                      {fight.predictedFunScore || 0}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-cyan-500/10 border border-cyan-500/20 px-4 py-3">
                      <span className="block text-[0.7rem] md:text-[0.75rem] text-cyan-300/70">Finish Probability</span>
                      <span className="ufc-condensed text-xl text-cyan-300">
                        {Math.round((fight.finishProbability || 0) * 100)}%
                      </span>
                    </div>
                    <div className="rounded-xl bg-white/5 px-4 py-3">
                      <span className="block text-[0.7rem] md:text-[0.75rem] text-white/70">Risk Profile</span>
                      <span className="ufc-condensed text-lg text-white">
                        {fight.riskLevel || 'Balanced'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* AI Analysis */}
                {(fight.aiDescription || fight.funReasoning) && (
                  <div className="mb-5 space-y-3">
                    {/* Finish Probability Analysis */}
                    {fight.aiDescription && (
                      <div>
                        <p className="ufc-condensed text-xs text-white/70 mb-2">Finish Probability Analysis</p>
                        <p className="text-sm leading-relaxed text-white/80">
                          {fight.aiDescription}
                        </p>
                      </div>
                    )}

                    {/* Fun Score Analysis */}
                    {fight.funReasoning && (
                      <div>
                        <p className="ufc-condensed text-xs text-white/70 mb-2">Fun Score Analysis</p>
                        <p className="text-sm leading-relaxed text-white/80 mb-3">
                          {fight.funReasoning}
                        </p>
                        {/* Key Factors as Bubbles */}
                        {Array.isArray(fight.funFactors) && fight.funFactors.length > 0 && (
                          <div>
                            <p className="ufc-condensed text-[0.65rem] md:text-[0.7rem] uppercase tracking-[0.3em] text-white/50 mb-2">Key Factors</p>
                            <div className="flex flex-wrap gap-2">
                              {fight.funFactors.map((factor, idx) => (
                                <span
                                  key={idx}
                                  className="inline-block rounded-full bg-[var(--ufc-red)]/20 px-3 py-1 text-xs font-medium text-white/90 border border-[var(--ufc-red)]/30"
                                >
                                  {typeof factor === 'string' ? factor : factor.type}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Fight Prediction */}
                {fight.fightPrediction && (
                  <div>
                    <p className="ufc-condensed text-xs text-white/70 mb-2">Analyst Pick</p>
                    <p className="text-sm text-white/80">{fight.fightPrediction}</p>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  )
}