export type UserRole = "user" | "volunteer" | "admin";

export type VolunteerStatus = "none" | "pending" | "approved" | "rejected";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  volunteerStatus: VolunteerStatus;
  volunteerApplication?: {
    appliedAt: string;
    skills?: string[];
    area?: string;
    notes?: string;
  };
  phone?: string;
  area?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthError {
  code: string;
  message: string;
}

export type SosStatus = "active" | "assigned" | "resolved" | "cancelled";

export type SosLocationSource = "gps" | "manual";

export interface SosLocation {
  address: string;
  /** "gps" = device-provided coordinates; "manual" = address typed by the user (approximate). */
  source?: SosLocationSource;
  lat?: number;
  lng?: number;
  /** Device-reported horizontal accuracy in metres (GPS only). */
  accuracyMeters?: number;
  /** Legacy free-text accuracy string written by older versions. */
  accuracy?: string;
  /** ISO time of the last location write (GPS only). */
  updatedAt?: string;
}

export interface SosAssignedResponder {
  unit: string;
  eta: string;
  responderId?: string;
  /** ISO time the assignment was recorded. */
  assignedAt?: string;
  /** Real responder position, only present if the responder shared one. */
  location?: { lat: number; lng: number; updatedAt: string };
}

export interface SosRequest {
  id?: string;
  userId: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  message?: string;
  location: SosLocation;
  status: SosStatus;
  assignedResponder?: SosAssignedResponder;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  cancelledAt?: string;
}
