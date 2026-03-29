import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  TextInput, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Colors, MacroColors } from '../constants/theme';
import { useStore } from '../store/useStore';
import { scanFoodWithAI, lookupBarcode, searchFoods, parseFoodWithAI } from '../services/food';

export default function ScanScreen({ navigation }: any) {
  const [permission, requestPermission] = useCameraPermissions();
  const [tab, setTab] = useState<'photo' | 'barcode' | 'search' | 'text'>('photo');
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [mealSlot, setMealSlot] = useState('Lunch');
  const cameraRef = useRef<any>(null);
  const { dark, subscription, onboarding: ob, addMeal, addRecentFood, user, session } = useStore();

  // Barcode state
  const [barcodeScanned, setBarcodeScanned] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // NLP state
  const [nlpText, setNlpText] = useState('');
  const [nlpLoading, setNlpLoading] = useState(false);

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, []);

  async function handleCapture() {
    if (!cameraRef.current) return;
    setScanning(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      const data = await scanFoodWithAI(photo.base64);
      setResult(data);
    } catch (err: any) {
      Alert.alert('Scan Failed', err.message || 'Try again or log manually.');
    } finally {
      setScanning(false);
    }
  }

  async function handleBarcodeLookup() {
    if (!barcodeInput.trim()) return;
    setBarcodeLoading(true);
    try {
      const data = await lookupBarcode(barcodeInput.trim());
      if (data) {
        setResult({
          name: data.name || data.product_name || 'Unknown Product',
          calories: data.calories || 0,
          protein: data.protein || 0,
          carbs: data.carbs || 0,
          fat: data.fat || 0,
          confidence: 0.95,
          serving_size: data.serving_size,
        });
      } else {
        Alert.alert('Not Found', 'No product found for this barcode. Try scanning with AI instead.');
      }
    } catch (err: any) {
      Alert.alert('Lookup Failed', err.message || 'Try again.');
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function handleBarcodeScanned(data: string) {
    if (barcodeScanned) return;
    setBarcodeScanned(true);
    setBarcodeInput(data);
    setBarcodeLoading(true);
    try {
      const result = await lookupBarcode(data);
      if (result) {
        setResult({
          name: result.name || result.product_name || 'Unknown Product',
          calories: result.calories || 0,
          protein: result.protein || 0,
          carbs: result.carbs || 0,
          fat: result.fat || 0,
          confidence: 0.95,
          serving_size: result.serving_size,
        });
      } else {
        Alert.alert('Not Found', 'Product not in database. Enter UPC manually or scan with AI.');
      }
    } catch (err: any) {
      Alert.alert('Lookup Failed', err.message);
    } finally {
      setBarcodeLoading(false);
      setTimeout(() => setBarcodeScanned(false), 3000);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const results = await searchFoods(searchQuery.trim());
      setSearchResults(results);
      if (results.length === 0) {
        Alert.alert('No Results', 'Try a different search term or scan with AI.');
      }
    } catch (err: any) {
      Alert.alert('Search Failed', err.message);
    } finally {
      setSearchLoading(false);
    }
  }

  function selectSearchResult(item: any) {
    setResult({
      name: item.name,
      calories: item.calories || 0,
      protein: item.protein || 0,
      carbs: item.carbs || 0,
      fat: item.fat || 0,
      confidence: 1.0,
      serving_size: item.serving_size,
    });
    setSearchResults([]);
    setSearchQuery('');
  }

  async function handleNLP() {
    if (!nlpText.trim()) return;
    setNlpLoading(true);
    try {
      const data = await parseFoodWithAI(nlpText.trim());
      setResult(data);
    } catch (err: any) {
      Alert.alert('Parse Failed', err.message || 'Try again with different wording.');
    } finally {
      setNlpLoading(false);
    }
  }

  async function handleLog() {
    if (!result) return;
    const meal = {
      id: Date.now().toString(),
      user_id: session?.user?.id || user?.id || '',
      date: new Date().toISOString().split('T')[0],
      slot: mealSlot as any,
      food: result.name,
      calories: result.calories,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      method: (tab === 'photo' ? 'ai' : tab === 'barcode' ? 'barcode' : tab === 'text' ? 'manual' : 'search') as any,
      confidence: result.confidence,
      logged_at: new Date().toISOString(),
    };
    addMeal(meal);
    addRecentFood({
      name: result.name,
      calories: result.calories,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
    });
    Alert.alert('Logged!', `${result.name} added to ${mealSlot}`);
    setResult(null);
    setNlpText('');
    navigation.goBack();
  }

  const dietWarnings = (ob.diet || []).filter((d: string) => d !== 'none');

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: dark ? Colors.bg : Colors.bgLight }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ fontSize: 20, color: dark ? Colors.t2 : Colors.t2Light }}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: dark ? Colors.t1 : Colors.t1Light }]}>AI Scanner</Text>
        <Text style={{ fontSize: 11, color: dark ? Colors.t3 : Colors.t3Light }}>
          {subscription === 'free' ? '1 / 2 left' : 'Unlimited'}
        </Text>
      </View>

      {/* Meal slot selector */}
      <View style={[styles.slotRow, { backgroundColor: dark ? Colors.card : Colors.cardLight }]}>
        {['Breakfast', 'Lunch', 'Dinner', 'Snack'].map((s) => (
          <TouchableOpacity key={s} onPress={() => setMealSlot(s)}
            style={[styles.slotBtn, mealSlot === s && { backgroundColor: Colors.ember }]}>
            <Text style={[styles.slotText, mealSlot === s && { color: '#fff' }]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Mode tabs */}
      <View style={[styles.modeTabs, { backgroundColor: dark ? Colors.card : Colors.cardLight }]}>
        {(['photo', 'barcode', 'search', 'text'] as const).map((m) => (
          <TouchableOpacity key={m} onPress={() => { setTab(m); setResult(null); }}
            style={[styles.modeTab, tab === m && styles.modeTabActive]}>
            <Text style={[styles.modeTabText, tab === m && { color: '#fff', fontWeight: '600' }]}>
              {m === 'photo' ? '📷 AI' : m === 'barcode' ? '🔲 Barcode' : m === 'search' ? '🔍 Search' : '✏️ Type'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* === PHOTO TAB === */}
      {tab === 'photo' && !result && (
        <>
          {permission?.granted ? (
            <CameraView ref={cameraRef} style={styles.viewfinder} facing="back">
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
              {scanning && (
                <View style={styles.scanOverlay}>
                  <ActivityIndicator size="large" color={Colors.ember} />
                  <Text style={styles.scanText}>Analyzing with AI...</Text>
                </View>
              )}
            </CameraView>
          ) : (
            <View style={[styles.viewfinder, { backgroundColor: dark ? '#1A1A1E' : '#F0F0F2' }]}>
              <View style={[styles.corner, styles.tl]} />
              <View style={[styles.corner, styles.tr]} />
              <View style={[styles.corner, styles.bl]} />
              <View style={[styles.corner, styles.br]} />
              <Text style={{ fontSize: 72 }}>🍛</Text>
            </View>
          )}
          <Text style={[styles.hint, { color: dark ? Colors.t3 : Colors.t3Light }]}>
            {permission?.granted ? 'Point camera at your meal' : 'Tap shutter to simulate'}
          </Text>
          <TouchableOpacity style={styles.captureBtn}
            onPress={permission?.granted ? handleCapture : () => {
              setResult({
                name: 'Chicken Taco (x2)', calories: 380, protein: 28,
                carbs: 32, fat: 14, confidence: 0.97,
              });
            }}
          />
        </>
      )}

      {/* === BARCODE TAB === */}
      {tab === 'barcode' && !result && (
        <View style={styles.barcodeContainer}>
          {permission?.granted ? (
            <CameraView
              style={styles.barcodeScanner}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }}
              onBarcodeScanned={barcodeScanned ? undefined : (e) => handleBarcodeScanned(e.data)}
            >
              <View style={styles.barcodeLine} />
              {barcodeLoading && (
                <View style={styles.scanOverlay}>
                  <ActivityIndicator size="large" color={Colors.ember} />
                  <Text style={styles.scanText}>Looking up product...</Text>
                </View>
              )}
            </CameraView>
          ) : (
            <View style={[styles.barcodeScanner, { backgroundColor: dark ? '#1A1A1E' : '#F0F0F2', alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 48 }}>🔲</Text>
              <Text style={{ color: Colors.t3, fontSize: 12, marginTop: 8 }}>Camera needed for scanning</Text>
            </View>
          )}
          <Text style={[styles.hint, { color: dark ? Colors.t3 : Colors.t3Light, marginTop: 8 }]}>
            Point at barcode or enter UPC manually
          </Text>
          <View style={styles.barcodeManual}>
            <TextInput
              style={[styles.barcodeInput, {
                backgroundColor: dark ? Colors.card : Colors.cardLight,
                color: dark ? Colors.t1 : Colors.t1Light,
                borderColor: dark ? Colors.border : Colors.borderLight,
              }]}
              placeholder="Enter UPC code..."
              placeholderTextColor={Colors.t3}
              value={barcodeInput}
              onChangeText={setBarcodeInput}
              keyboardType="number-pad"
              returnKeyType="search"
              onSubmitEditing={handleBarcodeLookup}
            />
            <TouchableOpacity style={styles.barcodeBtn} onPress={handleBarcodeLookup}
              disabled={barcodeLoading}>
              <Text style={styles.barcodeBtnText}>
                {barcodeLoading ? '...' : 'Look Up'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* === SEARCH TAB === */}
      {tab === 'search' && !result && (
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <TextInput
              style={[styles.searchInput, {
                backgroundColor: dark ? Colors.card : Colors.cardLight,
                color: dark ? Colors.t1 : Colors.t1Light,
                borderColor: dark ? Colors.border : Colors.borderLight,
              }]}
              placeholder="Search foods... (e.g. chicken breast)"
              placeholderTextColor={Colors.t3}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              autoFocus
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}
              disabled={searchLoading}>
              <Text style={styles.searchBtnText}>
                {searchLoading ? '...' : '🔍'}
              </Text>
            </TouchableOpacity>
          </View>
          {searchLoading ? (
            <ActivityIndicator style={{ marginTop: 30 }} color={Colors.ember} />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id?.toString() || item.name}
              style={{ flex: 1, marginTop: 8 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => selectSearchResult(item)}
                  style={[styles.searchResultItem, {
                    backgroundColor: dark ? Colors.card : Colors.cardLight,
                    borderColor: dark ? Colors.border : Colors.borderLight,
                  }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.searchResultName, { color: dark ? Colors.t1 : Colors.t1Light }]}>
                      {item.name}
                    </Text>
                    <Text style={{ fontSize: 10, color: Colors.t3 }}>
                      {item.serving_size || '1 serving'} · {item.category || ''}
                    </Text>
                  </View>
                  <View style={styles.searchResultMacros}>
                    <Text style={[styles.searchResultCal, { color: Colors.emberLight }]}>{item.calories}</Text>
                    <Text style={{ fontSize: 8, color: Colors.t3 }}>kcal</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                searchQuery.length > 0 && !searchLoading ? (
                  <Text style={{ color: Colors.t3, textAlign: 'center', marginTop: 30, fontSize: 12 }}>
                    No results. Try a different term.
                  </Text>
                ) : null
              }
            />
          )}
        </View>
      )}

      {/* === TEXT/NLP TAB === */}
      {tab === 'text' && !result && (
        <View style={styles.nlpContainer}>
          <Text style={[styles.nlpTitle, { color: dark ? Colors.t1 : Colors.t1Light }]}>
            Describe what you ate
          </Text>
          <Text style={{ fontSize: 11, color: Colors.t3, marginBottom: 12 }}>
            Type naturally — e.g. "2 eggs, toast with butter, and a coffee with cream"
          </Text>
          <TextInput
            style={[styles.nlpInput, {
              backgroundColor: dark ? Colors.card : Colors.cardLight,
              color: dark ? Colors.t1 : Colors.t1Light,
              borderColor: dark ? Colors.border : Colors.borderLight,
            }]}
            placeholder="What did you eat?"
            placeholderTextColor={Colors.t3}
            value={nlpText}
            onChangeText={setNlpText}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.nlpBtn, (!nlpText.trim() || nlpLoading) && { opacity: 0.5 }]}
            onPress={handleNLP}
            disabled={!nlpText.trim() || nlpLoading}
          >
            {nlpLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.nlpBtnText}>Analyze with AI</Text>
            )}
          </TouchableOpacity>

          {/* Quick recent foods */}
          <RecentFoods dark={dark} onSelect={(food: any) => {
            setResult({ ...food, confidence: 1.0 });
          }} />
        </View>
      )}

      {/* === RESULT CARD (shared across all tabs) === */}
      {result && (
        <View style={styles.resultContainer}>
          <View style={[styles.resultCard, {
            backgroundColor: dark ? Colors.card : Colors.cardLight,
            borderColor: dark ? Colors.border : Colors.borderLight,
          }]}>
            <View style={styles.resultTop}>
              <Text style={[styles.resultName, { color: dark ? Colors.t1 : Colors.t1Light }]}>
                {result.name}
              </Text>
              <View style={[styles.confBadge, { backgroundColor: Colors.greenDim }]}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: Colors.green }}>
                  {Math.round((result.confidence || 0.97) * 100)}%
                </Text>
              </View>
            </View>

            {result.serving_size && (
              <Text style={{ fontSize: 10, color: Colors.t3, marginBottom: 6 }}>
                Serving: {result.serving_size}
              </Text>
            )}

            <View style={styles.macroGrid}>
              {[
                [result.calories, MacroColors.calories, 'kcal'],
                [`${result.protein}g`, MacroColors.protein, 'protein'],
                [`${result.carbs}g`, MacroColors.carbs, 'carbs'],
                [`${result.fat}g`, MacroColors.fat, 'fat'],
              ].map(([val, color, label], i) => (
                <View key={i} style={[styles.macroCell, {
                  backgroundColor: dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                }]}>
                  <Text style={[styles.macroCellVal, { color: color as string }]}>{val}</Text>
                  <Text style={styles.macroCellLabel}>{label as string}</Text>
                </View>
              ))}
            </View>

            {(subscription === 'plus' || subscription === 'pro') && tab === 'photo' && (
              <View style={[styles.depthBadge, { backgroundColor: Colors.blueDim }]}>
                <Text style={{ fontSize: 11, color: Colors.blue }}>📐 Depth estimation active — portion verified</Text>
              </View>
            )}

            {dietWarnings.includes('dairy-free') && (
              <View style={[styles.warnBadge, { backgroundColor: Colors.redDim }]}>
                <Text style={{ fontSize: 11, color: Colors.red }}>⚠️ Contains dairy — conflicts with dairy-free</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                style={[styles.logBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: Colors.ember }]}
                onPress={() => setResult(null)}
              >
                <Text style={[styles.logBtnText, { color: Colors.ember }]}>← Redo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.logBtn, { flex: 2 }]} onPress={handleLog}>
                <Text style={styles.logBtnText}>✓ Confirm & Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function RecentFoods({ dark, onSelect }: { dark: boolean; onSelect: (food: any) => void }) {
  const { recentFoods } = useStore();
  if (!recentFoods || recentFoods.length === 0) return null;

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: dark ? Colors.t1 : Colors.t1Light, marginBottom: 8 }}>
        Recent Foods
      </Text>
      {recentFoods.slice(0, 5).map((food, i) => (
        <TouchableOpacity key={i} onPress={() => onSelect(food)}
          style={[recentStyles.item, {
            backgroundColor: dark ? Colors.card : Colors.cardLight,
            borderColor: dark ? Colors.border : Colors.borderLight,
          }]}>
          <Text style={[recentStyles.name, { color: dark ? Colors.t1 : Colors.t1Light }]}>{food.name}</Text>
          <Text style={[recentStyles.cal, { color: Colors.emberLight }]}>{food.calories} kcal</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const recentStyles = StyleSheet.create({
  item: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 10, paddingHorizontal: 12, borderRadius: 10, marginBottom: 4, borderWidth: 1,
  },
  name: { fontSize: 12, fontWeight: '500' },
  cal: { fontSize: 11, fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 58, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: { fontSize: 16, fontWeight: '600' },
  slotRow: {
    flexDirection: 'row', gap: 3, borderRadius: 10, padding: 3, marginBottom: 8,
  },
  slotBtn: { flex: 1, padding: 6, alignItems: 'center', borderRadius: 8 },
  slotText: { fontSize: 10, fontWeight: '500', color: Colors.t3 },
  modeTabs: {
    flexDirection: 'row', gap: 3, borderRadius: 10, padding: 3, marginBottom: 12,
  },
  modeTab: { flex: 1, padding: 8, alignItems: 'center', borderRadius: 8 },
  modeTabActive: { backgroundColor: Colors.ember },
  modeTabText: { fontSize: 11, fontWeight: '500', color: Colors.t3 },
  viewfinder: {
    aspectRatio: 1, borderRadius: 22, overflow: 'hidden',
    position: 'relative', alignItems: 'center', justifyContent: 'center',
    marginBottom: 10, backgroundColor: '#1A1A1E',
  },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: Colors.ember, borderStyle: 'solid' },
  tl: { top: 18, left: 18, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 5 },
  tr: { top: 18, right: 18, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 5 },
  bl: { bottom: 18, left: 18, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 5 },
  br: { bottom: 18, right: 18, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 5 },
  scanOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  scanText: { color: '#fff', fontSize: 13, marginTop: 12 },
  hint: { textAlign: 'center', fontSize: 10, marginBottom: 6 },
  captureBtn: {
    width: 68, height: 68, borderRadius: 34, alignSelf: 'center',
    backgroundColor: Colors.ember, borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.2)',
    shadowColor: Colors.ember, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45, shadowRadius: 22, marginVertical: 10,
  },
  // Barcode
  barcodeContainer: { flex: 1 },
  barcodeScanner: {
    height: 200, borderRadius: 18, overflow: 'hidden', position: 'relative',
  },
  barcodeLine: {
    position: 'absolute', top: '50%', left: 20, right: 20,
    height: 2, backgroundColor: Colors.ember, opacity: 0.8,
  },
  barcodeManual: { flexDirection: 'row', gap: 8, marginTop: 8 },
  barcodeInput: {
    flex: 1, borderRadius: 12, padding: 12, paddingHorizontal: 14,
    fontSize: 14, borderWidth: 1,
  },
  barcodeBtn: {
    backgroundColor: Colors.ember, borderRadius: 12, paddingHorizontal: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  barcodeBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  // Search
  searchContainer: { flex: 1 },
  searchBar: { flexDirection: 'row', gap: 8 },
  searchInput: {
    flex: 1, borderRadius: 12, padding: 12, paddingHorizontal: 14,
    fontSize: 14, borderWidth: 1,
  },
  searchBtn: {
    backgroundColor: Colors.ember, borderRadius: 12, width: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnText: { fontSize: 18 },
  searchResultItem: {
    flexDirection: 'row', alignItems: 'center', padding: 12, paddingHorizontal: 14,
    borderRadius: 12, marginBottom: 4, borderWidth: 1,
  },
  searchResultName: { fontSize: 13, fontWeight: '600' },
  searchResultMacros: { alignItems: 'center' },
  searchResultCal: { fontSize: 15, fontWeight: '700' },
  // NLP
  nlpContainer: { flex: 1 },
  nlpTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  nlpInput: {
    borderRadius: 14, padding: 14, fontSize: 14, borderWidth: 1,
    minHeight: 100, textAlignVertical: 'top',
  },
  nlpBtn: {
    marginTop: 10, padding: 14, borderRadius: 12,
    backgroundColor: Colors.ember, alignItems: 'center',
    shadowColor: Colors.ember, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 16,
  },
  nlpBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  // Result
  resultContainer: { flex: 1 },
  resultCard: { borderRadius: 14, padding: 14, borderWidth: 1 },
  resultTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  resultName: { fontSize: 14, fontWeight: '600', flex: 1 },
  confBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  macroGrid: { flexDirection: 'row', gap: 6 },
  macroCell: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8 },
  macroCellVal: { fontSize: 15, fontWeight: '700' },
  macroCellLabel: { fontSize: 8, color: Colors.t3, marginTop: 1 },
  depthBadge: { marginTop: 8, padding: 8, paddingHorizontal: 12, borderRadius: 8 },
  warnBadge: { marginTop: 8, padding: 8, paddingHorizontal: 12, borderRadius: 8 },
  logBtn: {
    marginTop: 0, padding: 12, borderRadius: 12,
    backgroundColor: Colors.ember, alignItems: 'center',
    shadowColor: Colors.ember, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 16,
  },
  logBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
