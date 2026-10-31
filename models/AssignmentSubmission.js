const mongoose = require('mongoose');

const AssignmentSubmissionSchema = new mongoose.Schema({
  assignmentId: { type: Number, required: true },
  traineeId: { type: String, required: true },
  status: { type: String, enum: ['not_submitted', 'submitted', 'needs_revision', 'completed'], required: true },
  responseId: { type: String, default: '', maxlength: 120 },
  submittedAt: { type: Date, default: null },
  note: { type: String, default: '', maxlength: 2000 },
  reviewedBy: { type: String, required: true },
  reviewedAt: { type: Date, required: true }
}, { timestamps: true });

AssignmentSubmissionSchema.index({ assignmentId: 1, traineeId: 1 }, { unique: true });

module.exports = mongoose.model('AssignmentSubmission', AssignmentSubmissionSchema);
