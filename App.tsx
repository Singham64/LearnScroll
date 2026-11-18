import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewToken,
} from 'react-native';
import { ProblemCard } from './src/components/ProblemCard';
import {
  AdaptiveState,
  createInitialAdaptiveState,
  registerAttemptInState,
  selectNextCard,
} from './src/engine/adaptiveEngine';
import {
  loadAllQuestions,
  loadPerformanceLog,
  logAttempt,
} from './src/storage/csvStorage';
import { AttemptRecord, QuestionCard } from './src/types';

interface FeedItem {
  instanceKey: string;
  card: QuestionCard;
  reason: string;
}

export default function App() {
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [allCards, setAllCards] = useState<QuestionCard[]>([]);
  const [history, setHistory] = useState<AttemptRecord[]>([]);
  const [adaptiveState, setAdaptiveState] = useState<AdaptiveState>(
    createInitialAdaptiveState()
  );
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const [cards, pastAttempts] = await Promise.all([
        loadAllQuestions(),
        loadPerformanceLog(),
      ]);
      setAllCards(cards);
      setHistory(pastAttempts);

      if (cards.length > 0) {
        const initialState = createInitialAdaptiveState();
        const first = selectNextCard(cards, pastAttempts, initialState);
        setFeed([
          {
            instanceKey: `${first.nextCard.id}-0`,
            card: first.nextCard,
            reason: first.reason,
          },
        ]);
      }
      setLoading(false);
    })();
  }, []);

  const handleCompleteAttempt = async (
    card: QuestionCard,
    result: { correct: boolean; responseTimeMs: number; isRetry: boolean }
  ) => {
    const record: AttemptRecord = {
      timestamp: new Date().toISOString(),
      questionId: card.id,
      topic: card.topic,
      difficulty: card.difficulty,
      correct: result.correct,
      responseTimeMs: result.responseTimeMs,
      isRetry: result.isRetry,
    };

    await logAttempt(record);
    const updatedHistory = [...history, record];
    setHistory(updatedHistory);

    const nextAdaptive = registerAttemptInState(adaptiveState, card, record);
    const selection = selectNextCard(
      allCards,
      updatedHistory,
      nextAdaptive,
      card.id
    );

    setAdaptiveState({
      ...nextAdaptive,
      reviewQueue: selection.updatedQueue,
    });

    setFeed((prev) => [
      ...prev,
      {
        instanceKey: `${selection.nextCard.id}-${prev.length}`,
        card: selection.nextCard,
        reason: selection.reason,
      },
    ]);
  };

  const onViewableItemsChanged = ({
    viewableItems,
  }: {
    viewableItems: ViewToken[];
  }) => {
    if (viewableItems.length > 0 && viewableItems[0].index !== null) {
      setActiveIndex(viewableItems[0].index);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#38BDF8" />
      </SafeAreaView>
    );
  }

  if (feed.length === 0) {
    return (
      <SafeAreaView style={styles.centered}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>LearnScroll Engine Ready</Text>
          <Text style={styles.emptyBody}>
            No question rows are loaded yet. Add rows to{' '}
            <Text style={styles.code}>src/data/starterCsv.ts</Text> or import a
            CSV pack using <Text style={styles.code}>templates/question_pack_template.csv</Text>.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <FlatList
        data={feed}
        keyExtractor={(item) => item.instanceKey}
        pagingEnabled
        snapToInterval={height}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 80 }}
        renderItem={({ item, index }) => (
          <ProblemCard
            card={item.card}
            badgeLabel={item.reason}
            cardHeight={height}
            isActive={index === activeIndex}
            onCompleteAttempt={(res) => handleCompleteAttempt(item.card, res)}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0F172A' },
  centered: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyTitle: {
    color: '#38BDF8',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyBody: { color: '#CBD5E1', fontSize: 15, lineHeight: 22 },
  code: { color: '#FBBF24', fontFamily: 'monospace' },
});
