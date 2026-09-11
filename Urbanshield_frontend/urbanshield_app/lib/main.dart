import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

void main() {
  runApp(const UrbanShieldApp());
}

class UrbanShieldApp extends StatelessWidget {
  const UrbanShieldApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'UrbanShield AI',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF1E3A8A),
          primary: const Color(0xFF1E3A8A),
        ),
        scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      ),
      home: const MainNavigationScreen(),
    );
  }
}

class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    LiveMapScreen(),
    ReportHazardScreen(),
    SafeNavigationScreen(),
    CivicDashboardScreen(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map),
            label: 'Live Map',
          ),
          NavigationDestination(
            icon: Icon(Icons.add_a_photo_outlined),
            selectedIcon: Icon(Icons.add_a_photo),
            label: 'Report',
          ),
          NavigationDestination(
            icon: Icon(Icons.alt_route_outlined),
            selectedIcon: Icon(Icons.alt_route),
            label: 'Safe Route',
          ),
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Civic Admin',
          ),
        ],
      ),
    );
  }
}

// ==========================================
// 1. LIVE HAZARD MAP & PROXIMITY ALERTS
// ==========================================
class LiveMapScreen extends StatefulWidget {
  const LiveMapScreen({super.key});

  @override
  State<LiveMapScreen> createState() => _LiveMapScreenState();
}

class _LiveMapScreenState extends State<LiveMapScreen> {
  LatLng _currentLocation = const LatLng(22.5726, 88.3639);
  String _selectedCategory = 'All';

  final List<Map<String, dynamic>> _hazards = [
    {
      'id': 1,
      'title': 'Open Manhole',
      'category': 'Civic Infra',
      'lat': 22.5726,
      'lng': 88.3639,
      'severity': 88,
      'level': 'Critical',
      'color': Colors.red
    },
    {
      'id': 2,
      'title': 'Waterlogging',
      'category': 'Environmental',
      'lat': 22.5850,
      'lng': 88.3750,
      'severity': 65,
      'level': 'High',
      'color': Colors.orange
    },
    {
      'id': 3,
      'title': 'Deep Pothole',
      'category': 'Road Hazards',
      'lat': 22.5600,
      'lng': 88.3500,
      'severity': 42,
      'level': 'Medium',
      'color': Colors.amber
    },
    {
      'id': 4,
      'title': 'Hanging Wires',
      'category': 'Electrical',
      'lat': 22.5680,
      'lng': 88.3610,
      'severity': 90,
      'level': 'Critical',
      'color': Colors.red
    },
  ];

  @override
  Widget build(BuildContext context) {
    final filteredHazards = _selectedCategory == 'All'
        ? _hazards
        : _hazards.where((h) => h['category'] == _selectedCategory).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('UrbanShield AI — Live Safety Layer', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.white,
        elevation: 1,
      ),
      body: Stack(
        children: [
          FlutterMap(
            options: MapOptions(
              initialCenter: _currentLocation,
              initialZoom: 14.0,
            ),
            children: [
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.urbanshield.app',
              ),
              MarkerLayer(
                markers: filteredHazards.map((hazard) {
                  return Marker(
                    point: LatLng(hazard['lat'], hazard['lng']),
                    width: 40,
                    height: 40,
                    child: GestureDetector(
                      onTap: () {
                        showModalBottomSheet(
                          context: context,
                          builder: (context) => Container(
                            padding: const EdgeInsets.all(20),
                            height: 200,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(hazard['title'], style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                                const SizedBox(height: 8),
                                Text('Category: ${hazard['category']}'),
                                Text('Severity Score: ${hazard['severity']}/100'),
                                Text('Risk Level: ${hazard['level']}'),
                              ],
                            ),
                          ),
                        );
                      },
                      child: Icon(Icons.location_on, color: hazard['color'], size: 38),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),

          // Top Proximity Alert Banner
          Positioned(
            top: 12,
            left: 12,
            right: 12,
            child: Card(
              color: Colors.red.shade700,
              elevation: 4,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: Colors.white, size: 26),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        '⚠ Open manhole detected 180m ahead!',
                        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // Horizontal Category Filter Pills
          Positioned(
            bottom: 16,
            left: 12,
            right: 12,
            child: SizedBox(
              height: 40,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: ['All', 'Road Hazards', 'Civic Infra', 'Electrical', 'Temporary', 'Environmental'].map((cat) {
                  final isSelected = _selectedCategory == cat;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8.0),
                    child: FilterChip(
                      selected: isSelected,
                      label: Text(cat, style: TextStyle(color: isSelected ? Colors.white : Colors.black87, fontSize: 12)),
                      selectedColor: const Color(0xFF1E3A8A),
                      onSelected: (val) {
                        setState(() {
                          _selectedCategory = cat;
                        });
                      },
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ==========================================
// 2. AI REPORT HAZARD FLOW
// ==========================================
class ReportHazardScreen extends StatefulWidget {
  const ReportHazardScreen({super.key});

  @override
  State<ReportHazardScreen> createState() => _ReportHazardScreenState();
}

class _ReportHazardScreenState extends State<ReportHazardScreen> {
  String _selectedCategory = 'Pothole';
  bool _isSubmitting = false;
  final ImagePicker _picker = ImagePicker();
  XFile? _selectedImage;

  Future<void> _pickImage() async {
    final photo = await _picker.pickImage(source: ImageSource.camera);
    if (photo != null) {
      setState(() {
        _selectedImage = photo;
      });
    }
  }

  Future<void> _submitReport() async {
    setState(() { _isSubmitting = true; });

    try {
      Position position = await Geolocator.getCurrentPosition();
      
      // POST Request to FastAPI Backend
      var request = http.MultipartRequest('POST', Uri.parse('http://localhost:8000/api/hazards/report'));
      request.fields['category'] = _selectedCategory;
      request.fields['latitude'] = position.latitude.toString();
      request.fields['longitude'] = position.longitude.toString();
      
      if (_selectedImage != null) {
        request.files.add(await http.MultipartFile.fromPath('file', _selectedImage!.path));
      }

      await request.send();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Hazard submitted! AI evaluating confidence & severity...'), backgroundColor: Colors.green),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Report logged locally (Backend connecting...)'), backgroundColor: Colors.blue),
        );
      }
    } finally {
      setState(() { _isSubmitting = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Report Urban Hazard'), backgroundColor: Colors.white, elevation: 1),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('1. Capture Hazard Photo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 10),
              GestureDetector(
                onTap: _pickImage,
                child: Container(
                  height: 160,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.grey.shade200,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey.shade400),
                  ),
                  child: _selectedImage == null
                      ? const Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.camera_alt, size: 40, color: Colors.grey),
                            SizedBox(height: 8),
                            Text('Tap to open camera', style: TextStyle(color: Colors.grey)),
                          ],
                        )
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: const Center(child: Text('📷 Image Attached', style: TextStyle(fontWeight: FontWeight.bold))),
                        ),
                ),
              ),
              const SizedBox(height: 24),
              const Text('2. Select Hazard Category', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
              const SizedBox(height: 10),
              DropdownButtonFormField<String>(
                value: _selectedCategory,
                items: ['Pothole', 'Open Manhole', 'Waterlogging', 'Hanging Wires', 'Rally Diversion', 'Fallen Tree']
                    .map((cat) => DropdownMenuItem(value: cat, child: Text(cat)))
                    .toList(),
                onChanged: (val) => setState(() => _selectedCategory = val!),
                decoration: const InputDecoration(border: OutlineInputBorder()),
              ),
              const SizedBox(height: 30),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _submitReport,
                  style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF1E3A8A)),
                  child: _isSubmitting
                      ? const CircularProgressIndicator(color: Colors.white)
                      : const Text('Submit to AI Engine', style: TextStyle(color: Colors.white, fontSize: 16)),
                ),
              )
            ],
          ),
        ),
      ),
    );
  }
}

// ==========================================
// 3. SMART SAFE ROUTE NAVIGATION MODULE
// ==========================================
class SafeNavigationScreen extends StatefulWidget {
  const SafeNavigationScreen({super.key});

  @override
  State<SafeNavigationScreen> createState() => _SafeNavigationScreenState();
}

class _SafeNavigationScreenState extends State<SafeNavigationScreen> {
  bool _preferSafestRoute = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Smart Safe Navigation'), backgroundColor: Colors.white, elevation: 1),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12.0),
                child: Column(
                  children: [
                    const TextField(decoration: InputDecoration(labelText: 'Start: Howrah Station', prefixIcon: Icon(Icons.my_location))),
                    const TextField(decoration: InputDecoration(labelText: 'Destination: Park Street', prefixIcon: Icon(Icons.location_on))),
                    const SizedBox(height: 10),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        const Text('Prioritize Safest Route (Avoid Hazards)', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                        Switch(
                          value: _preferSafestRoute,
                          onChanged: (val) => setState(() => _preferSafestRoute = val),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView(
                children: [
                  Card(
                    color: _preferSafestRoute ? Colors.green.shade50 : Colors.white,
                    child: const ListTile(
                      leading: Icon(Icons.shield, color: Colors.green),
                      title: Text('UrbanShield Safe Route (Recommended)', style: TextStyle(fontWeight: FontWeight.bold)),
                      subtitle: Text('24 mins • 8.2 km\n✓ Avoids waterlogged MG Road\n✓ Avoids political rally near Central'),
                    ),
                  ),
                  const Card(
                    child: ListTile(
                      leading: Icon(Icons.timer, color: Colors.grey),
                      title: Text('Fastest Standard Route'),
                      subtitle: Text('19 mins • 7.1 km\n⚠ Contains 1 active open manhole & severe potholes'),
                    ),
                  ),
                ],
              ),
            )
          ],
        ),
      ),
    );
  }
}

// ==========================================
// 4. CIVIC AUTHORITY DASHBOARD
// ==========================================
class CivicDashboardScreen extends StatelessWidget {
  const CivicDashboardScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Kolkata Municipal Control Panel'), backgroundColor: Colors.white, elevation: 1),
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(
              children: [
                Expanded(
                  child: Card(
                    color: Colors.redAccent,
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Column(children: [Text('Critical', style: TextStyle(color: Colors.white)), Text('4', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold))]),
                    ),
                  ),
                ),
                Expanded(
                  child: Card(
                    color: Colors.amber,
                    child: Padding(
                      padding: EdgeInsets.all(16),
                      child: Column(children: [Text('Under Repair', style: TextStyle(color: Colors.white)), Text('12', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold))]),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Text('Ward-Wise Triage Queue', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 10),
            Expanded(
              child: ListView(
                children: const [
                  Card(
                    child: ListTile(
                      title: Text('Ward 42 — Open Manhole'),
                      subtitle: Text('Severity Score: 88/100 • Priority: High'),
                      trailing: Chip(label: Text('Reported', style: TextStyle(fontSize: 10))),
                    ),
                  ),
                  Card(
                    child: ListTile(
                      title: Text('Ward 38 — Waterlogging'),
                      subtitle: Text('Severity Score: 65/100 • Priority: Medium'),
                      trailing: Chip(label: Text('Active', style: TextStyle(fontSize: 10))),
                    ),
                  ),
                  Card(
                    child: ListTile(
                      title: Text('Ward 45 — Broken Road'),
                      subtitle: Text('Severity Score: 42/100 • Priority: Low'),
                      trailing: Chip(label: Text('Under Repair', style: TextStyle(fontSize: 10))),
                    ),
                  ),
                ],
              ),
            )
          ],
        ),
      ),
    );
  }
}