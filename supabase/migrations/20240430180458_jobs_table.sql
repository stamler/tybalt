create table t_divisions (
  id text primary key check (length(id) < 3),
  name text not null
);

create table t_time_types (
  id text primary key check (length(id) < 4),
  name text not null,
  description text
);

create table t_profiles_user_editable (
  id uuid primary key references t_profiles(id),
  location text,
  location_time timestamp with time zone,
  default_division text references t_divisions(id),
  manager_firebase_id text not null references t_profiles(firebase_id),
  alternate_manager_firebase_id text not null references t_profiles(firebase_id),
);

create table t_profiles (
  id uuid primary key references t_profiles_user_editable(id),
  firebase_id text not null unique,
  display_name text,
  email text,
  user_source_anchor64 text not null unique,
  mobile_phone text check (mobile_phone ~ '\d{7,15}' ), -- IDD without leading plus sign
  surname text not null,
  given_name text not null,
  job_title text,
  user_source_anchor text not null unique,
  azure_id uuid not null unique,
  salary boolean not null,
  time_sheet_expected boolean not null,
  -- custom_claims will be in the user_claims table
  -- mileage_claimed will be in a user_tallies view
  -- mileage_claimed_since will be in a user_tallies view
  -- used_op will be in a user_tallies view
  -- used_ov will be in a user_tallies view
  -- used_as_of will be in a user_tallies view
  payroll_id text check (payroll_id ~ '(\d{1,4})|(CMS\d{1,2})'),
  off_rotation boolean,
  default_charge_out_rate numeric not null,
  ms_graph_data_updated timestamp with time zone,
  opening_date_time_off date,
  opening_op numeric not null,
  opening_ov numeric not null,
  personal_vehicle_insurance_expiry date check (personal_vehicle_insurance_expiry > now()),
  do_not_accept_submissions boolean,
  untracked_time_off boolean,
  allow_personal_reimbursement boolean,
  bot text,
  work_week_hours numeric not null,
);

create table t_jobs (
  -- add check for format here with regex
  id text primary key check (id ~ '(P)?[0-9]{2}-[0-9]{3,4}(-[0-9]{1,2})?(-[0-9])?'),
  manager text, -- this is a legacy field that exists prior to referencing the t_profiles table
  client text,
  description text,
  client_contact text,
  status text check (
    -- proposals can have a value of "Active", "Cancelled", "Awarded", "Not Awarded"
    starts_with(id, 'P') and status in ('Active', 'Cancelled', 'Awarded', 'Not Awarded')
    -- projects can have a value of  "Active", "Cancelled", "Closed"
    or status in ('Active', 'Cancelled', 'Closed')
  ),
  manager_firebase_id text references t_profiles(firebase_id),
  proposal text references t_jobs(id),
  job_owner text check (length(job_owner) > 5),
  alternate_manager_firebase_id text references t_profiles(firebase_id),
  fn_agreement => boolean,

  -- TODO: divisions will be in a many-to-many relationship with jobs through
  -- the t_job_divisions table

  categories text[], -- categories are attached to the job so this is reasonable
  project_award_date date check (
    -- null if job is a proposal, else not null
    starts_with(id, 'P') and project_award_date is null
    or not starts_with(id, 'P') and project_award_date is not null
  ),
  proposal_submission_due_date date check (
    -- null if job is a project, else not null
    not starts_with(id, 'P') and proposal_submission_due_date is null
    or starts_with(id, 'P') and proposal_submission_due_date is not null
  ),
  proposal_opening_date date check (
    -- null if job is a project, else not null
    not starts_with(id, 'P') and proposal_opening_date is null
    or starts_with(id, 'P') and proposal_opening_date is not null
  ),
  )
);