import 'dotenv/config';
import { query } from './db/pool';
import { v4 as uuidv4 } from 'uuid';

interface DemoWorker {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  bio: string;
  primary_location: string;
  latitude: number;
  longitude: number;
  trust_score: number;
  tasks_completed: number;
  tasks_successful: number;
  on_time_rate: number;
  avg_rating: number;
  total_earnings: number;
  current_month_earnings: number;
}

const DEMO_WORKERS: DemoWorker[] = [
  {
    name: 'Amaka O.',
    email: 'amaka@taskverify.app',
    phone: '08012345601',
    skills: ['cleaning', 'physical-labor', 'laundry'],
    bio: 'Professional house cleaner with 5 years experience',
    primary_location: 'Akure, Ondo State',
    latitude: 7.2571,
    longitude: 5.1944,
    trust_score: 847,
    tasks_completed: 47,
    tasks_successful: 45,
    on_time_rate: 96,
    avg_rating: 4.8,
    total_earnings: 234500,
    current_month_earnings: 67200
  },
  {
    name: 'Chidinma A.',
    email: 'chidinma@taskverify.app',
    phone: '08023456701',
    skills: ['cleaning', 'errands', 'house-help'],
    bio: 'Reliable cleaning service provider',
    primary_location: 'Ondo, Ondo State',
    latitude: 7.1898,
    longitude: 4.7644,
    trust_score: 722,
    tasks_completed: 23,
    tasks_successful: 20,
    on_time_rate: 89,
    avg_rating: 4.5,
    total_earnings: 98500,
    current_month_earnings: 28400
  },
  {
    name: 'Yetunde F.',
    email: 'yetunde@taskverify.app',
    phone: '08034567801',
    skills: ['house-help', 'childcare', 'cleaning'],
    bio: 'Experienced in household management',
    primary_location: 'Akure, Ondo State',
    latitude: 7.2541,
    longitude: 5.1944,
    trust_score: 791,
    tasks_completed: 31,
    tasks_successful: 29,
    on_time_rate: 93,
    avg_rating: 4.7,
    total_earnings: 145200,
    current_month_earnings: 45600
  },
  {
    name: 'Emeka R.',
    email: 'emeka@taskverify.app',
    phone: '08045678901',
    skills: ['dispatch', 'delivery', 'documents'],
    bio: 'Fast and reliable dispatch rider',
    primary_location: 'Akure, Ondo State',
    latitude: 7.2571,
    longitude: 5.1944,
    trust_score: 923,
    tasks_completed: 112,
    tasks_successful: 110,
    on_time_rate: 98,
    avg_rating: 4.9,
    total_earnings: 567800,
    current_month_earnings: 156000
  },
  {
    name: 'Tunde B.',
    email: 'tunde@taskverify.app',
    phone: '08056789012',
    skills: ['delivery', 'courier', 'dispatch'],
    bio: 'Professional courier service',
    primary_location: 'Akure, Ondo State',
    latitude: 7.2600,
    longitude: 5.1950,
    trust_score: 814,
    tasks_completed: 67,
    tasks_successful: 61,
    on_time_rate: 91,
    avg_rating: 4.6,
    total_earnings: 234100,
    current_month_earnings: 78900
  },
  {
    name: 'Segun M.',
    email: 'segun@taskverify.app',
    phone: '08067890123',
    skills: ['dispatch', 'errands', 'delivery'],
    bio: 'Quick errand and delivery service',
    primary_location: 'Akure, Ondo State',
    latitude: 7.2580,
    longitude: 5.1940,
    trust_score: 654,
    tasks_completed: 38,
    tasks_successful: 33,
    on_time_rate: 87,
    avg_rating: 4.4,
    total_earnings: 156700,
    current_month_earnings: 52300
  }
];

async function seedDatabase(): Promise<void> {
  try {
    console.log('[Seed] Starting database seeding...');

    // Insert workers
    for (const worker of DEMO_WORKERS) {
      await query(
        `INSERT INTO workers 
         (external_id, name, email, phone, skills, bio, primary_location, latitude, longitude, 
          trust_score, tasks_completed, tasks_successful, on_time_rate, avg_rating, total_earnings, current_month_earnings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (email) DO NOTHING`,
        [
          uuidv4(),
          worker.name,
          worker.email,
          worker.phone,
          worker.skills,
          worker.bio,
          worker.primary_location,
          worker.latitude,
          worker.longitude,
          worker.trust_score,
          worker.tasks_completed,
          worker.tasks_successful,
          worker.on_time_rate,
          worker.avg_rating,
          worker.total_earnings,
          worker.current_month_earnings
        ]
      );
    }

    console.log('[Seed] Database seeding completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Seed] Error seeding database:', errorMessage);
    throw error;
  }
}

seedDatabase().then(() => {
  console.log('[Seed] Seed script completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('[Seed] Seed script failed:', error);
  process.exit(1);
});
