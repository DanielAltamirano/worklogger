const assert = require('assert');
const sinon = require('sinon');

const HarvestAppOutput = require('outputs/HarvestApp/Output');
const FormatterBase = require('formatters/FormatterBase');
const WorklogSet = require('models/WorklogSet');
const Worklog = require('models/Worklog');

describe('HarvestApp output', () => {
    it('can be instantiated', () => {
        assert.doesNotThrow(() => getTestSubject());
    });

    describe('#outputWorklogSet', () => {
        it('gets the list of available projects and tasks', (done) => {
            const getProjectsAndTasksStub = sinon.stub().returns(Promise.resolve());
            const fakeHarvestClientClass = getFakeHarvestClientClass({ getProjectsAndTasksStub });
            const output = getTestSubject({ fakeHarvestClientClass });

            output.outputWorklogSet(getTestWorklogSet()).then(() => {
                assert(getProjectsAndTasksStub.calledOnce);
            }).then(done)
            .catch(done);
        });

        it('saves each of the worklogs as time entries', (done) => {
            const saveNewTimeEntryStub = sinon.stub().returns(Promise.resolve());
            const getProjectsAndTasksStub = sinon.stub().returns(Promise.resolve([{
                projectId: 1,
                projectName: 'Project 1',
                tasks: [{
                    taskId: 2,
                    taskName: 'Task 2'
                }]
            }]));
            const fakeHarvestClientClass = getFakeHarvestClientClass({
                getProjectsAndTasksStub: getProjectsAndTasksStub,
                saveNewTimeEntryStub: saveNewTimeEntryStub
            });
            const output = getTestSubject({
                fakeHarvestClientClass,
                projectTag: 'Project',
                taskTag: 'Task'
            });

            const worklogCount = 5;
            const startingAt = new Date('2017-01-01T07:00-0400');
            const worklogSet = getTestWorklogSet({ worklogCount, startingAt, durationInMinutes: 30 });
            worklogSet.worklogs.forEach(w => {
                w.addTag('Project', 'Project 1');
                w.addTag('Task', 'Task 2');
            });

            // worklog times are:
            // 1. 2017-01-01T07:00-0400 to 2017-01-01T07:30-0400
            // 2. 2017-01-01T07:30-0400 to 2017-01-01T08:00-0400
            // 3. 2017-01-01T08:00-0400 to 2017-01-01T08:30-0400
            // 4. 2017-01-01T08:30-0400 to 2017-01-01T09:00-0400
            // 5. 2017-01-01T09:00-0400 to 2017-01-01T09:30-0400

            output.outputWorklogSet(worklogSet).then(() => {
                assert.equal(saveNewTimeEntryStub.callCount, worklogSet.worklogs.length);

                for (let i = 0; i < worklogCount; i++) {
                    const timeEntryArgument = saveNewTimeEntryStub.getCall(i).args[0];
                    const worklog = worklogSet.worklogs[i];

                    assert.equal(timeEntryArgument.project_id, 1);
                    assert.equal(timeEntryArgument.task_id, 2);
                    assert.equal(timeEntryArgument.spent_date, '2017-01-01');
                    const hour = Math.floor(11 + i / 2);
                    const minutes = i % 2 == 0 ? '00' : '30';
                    assert.equal(timeEntryArgument.timer_started_at, `2017-01-01T${hour}:${minutes}:00.000Z`);
                    assert.equal(timeEntryArgument.hours, 0.5);
                    assert.equal(timeEntryArgument.notes, `Worklog ${i+1}`);
                }
            }).then(done)
            .catch(done);
        });
    });
});

function getTestWorklogSet({
    worklogCount = 0,
    startingAt = new Date('2017-01-01T17:00-0400'),
    durationInMinutes = 30
} = {}) {
    const worklogs = [];
    for (let i = 0; i < worklogCount; i++) 
    {
        const endingAt = new Date(+startingAt + durationInMinutes * 60 * 1000);
        const worklog = new Worklog(`Worklog ${i+1}`, startingAt, endingAt);
        worklogs.push(worklog);
        startingAt = endingAt;
    }
    return new WorklogSet(new Date(), new Date(), worklogs);
}

function getTestSubject({
    fakeHarvestClientClass = getFakeHarvestClientClass(),
    projectTag = 'HarvestProjectTag',
    taskTag = 'HarvestTaskTag'
} = {}) {
    const formatterConfiguration = {};
    const formatter = new FormatterBase(formatterConfiguration);
    const outputConfiguration = {
        selectProjectFromTag: projectTag,
        selectTaskFromTag: taskTag
    };
    return new HarvestAppOutput(formatter, outputConfiguration, { HarvestClient: fakeHarvestClientClass });
}

function getFakeHarvestClientClass({
    getProjectsAndTasksStub = () => Promise.resolve(), 
    saveNewTimeEntryStub = () => Promise.resolve()
} = {}) {
    return class FakeHarvestClient {
        getProjectsAndTasks() {
            return getProjectsAndTasksStub();
        }

        saveNewTimeEntry(timeEntry) {
            return saveNewTimeEntryStub(timeEntry);
        }
    };
}